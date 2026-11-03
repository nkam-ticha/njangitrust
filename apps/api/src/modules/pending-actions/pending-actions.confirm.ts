// Confirming a pending action (spec 4.5 steps 3 and 4). Imported only by the HTTP route: the
// member taps in the app; neither the agent runtime nor any tool can reach this function.
//
// Exactly once: the PENDING -> CONFIRMED claim is an atomic update inside the transaction that
// also re-checks, executes and records the result. A second confirm waits on the row lock, then
// finds the action no longer pending. If execution fails, the transaction rolls back and the
// action is marked FAILED; nothing half-done is ever committed.
import { canonicalJSON } from '@njangi/rules';
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
import { openAction, redactionFor } from './pending-actions.storage';
import type { ExecuteResult } from './pending-actions.types';
import { getActionHandler } from './registry';

const log = componentLogger('pending-actions');

type Outcome =
  | { kind: 'lost' }
  | { kind: 'refused'; error: AppError }
  | { kind: 'executed'; result: ExecuteResult };

function samePreview(a: unknown, b: unknown): boolean {
  return canonicalJSON(actionPreviewSchema.parse(a)) === canonicalJSON(actionPreviewSchema.parse(b));
}

function failedData(action: PendingAction, error: AppError) {
  return {
    status: 'FAILED' as const,
    completedAt: clock.now(),
    failureCode: error.code,
    failureText: { fr: error.text.fr, en: error.text.en },
    ...redactionFor(action.type, action.args),
  };
}

async function markFailed(action: PendingAction, error: AppError): Promise<void> {
  const failed = await getPrisma().pendingAction.updateMany({
    where: { id: action.id, status: { in: ['PENDING', 'CONFIRMED'] } },
    data: failedData(action, error),
  });
  if (failed.count === 1) announce(openAction(await getPrisma().pendingAction.findUniqueOrThrow({ where: { id: action.id } })));
}

function failWith(tx: Prisma.TransactionClient, action: PendingAction, error: AppError) {
  return tx.pendingAction.update({ where: { id: action.id }, data: failedData(action, error) });
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

        const ctx = { userId: actor.userId, groupId: action.groupId, lang: actor.lang, origin: action.origin, now, db: tx };
        try {
          const preview = await handler.prepare(ctx, parsedArgs.data);
          if (!samePreview(preview, action.preview)) {
            const changed = actionError('ACTION_CHANGED');
            await failWith(tx, action, changed);
            return { kind: 'refused', error: changed };
          }
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
          await failWith(tx, action, error);
          return { kind: 'refused', error };
        }

        const result = await handler.execute(
          { ...ctx, pendingActionId: id, afterCommit: (effect) => effects.add(effect), effects },
          parsedArgs.data,
        );
        await tx.pendingAction.update({
          where: { id },
          data: {
            status: result.outcome === 'done' ? 'DONE' : 'CONFIRMED',
            ...(result.outcome === 'done' ? { completedAt: clock.now() } : {}),
            resultRef: result.resultRef ?? null,
            ...(result.outcome === 'done' ? redactionFor(action.type, action.args) : {}),
            ...(result.summary ? { resultSummary: { fr: result.summary.fr, en: result.summary.en } } : {}),
          },
        });
        return { kind: 'executed', result };
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
  } catch (error) {
    const appError = error instanceof AppError ? error : commonError('INTERNAL');
    if (!(error instanceof AppError)) log.error({ err: error, type: action.type }, 'action execution failed');
    await markFailed(action, appError);
    throw appError;
  }

  const fresh = openAction(await getPrisma().pendingAction.findUniqueOrThrow({ where: { id } }));
  if (outcome.kind === 'lost') {
    // Another confirmation won, or the action expired at this very moment.
    if (fresh.status === 'PENDING') throw actionError('ACTION_EXPIRED');
    throw notPendingError(fresh.status);
  }
  announce(fresh);
  if (outcome.kind === 'refused') throw outcome.error;
  await effects.run();
  return { action: fresh, data: outcome.result.data ?? null };
}
