// Confirming a pending action (spec 4.5 steps 3 and 4). Imported only by the HTTP route: the
// member taps in the app; neither the agent runtime nor any tool can reach this function.
//
// Exactly once: the PENDING -> CONFIRMED claim is an atomic update inside the transaction that
// also re-checks, executes and records the result. A second confirm waits on the row lock, then
// finds the action no longer pending. If execution fails, the transaction rolls back and the
// action is marked FAILED; nothing half-done is ever committed.
import { actionPreviewSchema } from '@njangi/shared/contracts/pending-actions';
import { AfterCommit } from '../../lib/after-commit';
import { clock } from '../../lib/clock';
import { AppError, commonError } from '../../lib/errors';
import { componentLogger } from '../../lib/logger';
import { getPrisma, type PendingAction, type Prisma } from '../../lib/prisma';
import type { AuthActor } from '../../permissions';
import { verifyMemberPin } from '../auth';
import { actionError, notPendingError } from './pending-actions.errors';
import { announce, getOwnPendingAction } from './pending-actions.service';
import { samePreview } from './pending-actions.preview';
import { openAction, redactionFor } from './pending-actions.storage';
import type { ExecuteResult } from './pending-actions.types';
import { getActionHandler } from './registry';

const log = componentLogger('pending-actions');

// `row` is the action as the transaction left it: no second read is needed to answer or announce.
type Outcome =
  | { kind: 'lost' }
  | { kind: 'refused'; error: AppError; row: PendingAction }
  | { kind: 'executed'; result: ExecuteResult; row: PendingAction };

/** `confirmedAt`: set when the claim in the same transaction stamped it. */
function failedData(action: PendingAction, error: AppError, confirmedAt: Date | null) {
  const completedAt = clock.now();
  return {
    status: 'FAILED' as const,
    completedAt,
    failureCode: error.code,
    failureText: { fr: error.text.fr, en: error.text.en },
    ...redactionFor(action.type, action.args, {
      createdAt: action.createdAt,
      expiresAt: action.expiresAt,
      confirmedAt,
      completedAt,
    }),
  };
}

async function markFailed(action: PendingAction, error: AppError): Promise<void> {
  const failed = await getPrisma().pendingAction.updateMany({
    where: { id: action.id, status: { in: ['PENDING', 'CONFIRMED'] } },
    data: failedData(action, error, action.confirmedAt),
  });
  if (failed.count === 1)
    announce(
      openAction(await getPrisma().pendingAction.findUniqueOrThrow({ where: { id: action.id } })),
    );
}

function failWith(
  tx: Prisma.TransactionClient,
  action: PendingAction,
  error: AppError,
  confirmedAt: Date,
) {
  return tx.pendingAction.update({
    where: { id: action.id },
    data: failedData(action, error, confirmedAt),
  });
}

export async function confirmPendingAction(
  actor: AuthActor,
  id: string,
  input: { pin?: string | undefined },
): Promise<{ action: PendingAction; data: Record<string, unknown> | null }> {
  const action = await getOwnPendingAction(actor.userId, id);
  if (action.status !== 'PENDING') throw notPendingError(action.status);
  const handler = getActionHandler(action.type);
  if (!handler) throw commonError('INTERNAL');

  // R13.2: L2 needs the member's own PIN. Checked before any lock is taken.
  if (handler.level === 'L2') await verifyMemberPin(actor.userId, input.pin);

  const parsedArgs = handler.args.safeParse(action.args);
  if (!parsedArgs.success) {
    await markFailed(action, commonError('INTERNAL'));
    throw commonError('INTERNAL');
  }

  const effects = new AfterCommit();
  let outcome: Outcome;
  try {
    outcome = await getPrisma().$transaction(
      async (tx): Promise<Outcome> => {
        const now = clock.now();
        const claimed = await tx.pendingAction.updateMany({
          where: { id, userId: actor.userId, status: 'PENDING', expiresAt: { gt: now } },
          data: { status: 'CONFIRMED', confirmedAt: now },
        });
        if (claimed.count !== 1) return { kind: 'lost' };

        const ctx = {
          userId: actor.userId,
          groupId: action.groupId,
          lang: actor.lang,
          origin: action.origin,
          now,
          db: tx,
        };
        try {
          const preview = await handler.prepare(ctx, parsedArgs.data);
          if (!samePreview(preview, action.preview)) {
            const changed = actionError('ACTION_CHANGED');
            return {
              kind: 'refused',
              error: changed,
              row: await failWith(tx, action, changed, now),
            };
          }
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
          return { kind: 'refused', error, row: await failWith(tx, action, error, now) };
        }

        const result = await handler.execute(
          {
            ...ctx,
            pendingActionId: id,
            // The card the member confirmed: a money action compares it again under its locks.
            preview: actionPreviewSchema.parse(action.preview),
            afterCommit: (effect) => effects.add(effect),
            effects,
          },
          parsedArgs.data,
        );
        const completedAt = clock.now();
        const row = await tx.pendingAction.update({
          where: { id },
          data: {
            status: result.outcome === 'done' ? 'DONE' : 'CONFIRMED',
            ...(result.outcome === 'done' ? { completedAt } : {}),
            resultRef: result.resultRef ?? null,
            ...(result.summary
              ? { resultSummary: { fr: result.summary.fr, en: result.summary.en } }
              : {}),
            // Last, so a confidential action keeps no choice-bearing text (L1).
            ...(result.outcome === 'done'
              ? redactionFor(action.type, action.args, {
                  createdAt: action.createdAt,
                  expiresAt: action.expiresAt,
                  confirmedAt: now,
                  completedAt,
                })
              : {}),
          },
        });
        return { kind: 'executed', result, row };
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
  } catch (error) {
    const appError = error instanceof AppError ? error : commonError('INTERNAL');
    if (!(error instanceof AppError)) {
      // L2: a confidential action's error could quote its content; log only the error's name.
      const confidential = handler.confidential?.(parsedArgs.data) ?? false;
      const detail = confidential ? { errorName: (error as Error).name } : { err: error };
      log.error({ ...detail, type: action.type }, 'action execution failed');
    }
    await markFailed(action, appError);
    throw appError;
  }

  if (outcome.kind === 'lost') {
    // Another confirmation won, or the action expired at this very moment.
    const current = await getPrisma().pendingAction.findUniqueOrThrow({ where: { id } });
    if (current.status === 'PENDING') throw actionError('ACTION_EXPIRED');
    throw notPendingError(current.status);
  }
  const fresh = openAction(outcome.row);
  announce(fresh);
  if (outcome.kind === 'refused') throw outcome.error;
  await effects.run();
  return { action: fresh, data: outcome.result.data ?? null };
}
