// Creating, reading, cancelling and expiring pending actions (spec 4.5). Confirmation lives in
// pending-actions.confirm.ts and is reachable only from the app's HTTP route. Rows returned by
// this module are "opened" (sealed args and previews decrypted) and must never be stored back.
import type { Lang } from '@njangi/shared';
import { actionPreviewSchema } from '@njangi/shared/contracts/pending-actions';
import { clock } from '../../lib/clock';
import { getPrisma, type PendingAction } from '../../lib/prisma';
import { authorizeOwner } from '../../permissions';
import { emitToUser } from '../../realtime/emitter';
import { toPendingActionUpdate } from '../../dto';
import { actionError, notPendingError } from './pending-actions.errors';
import { openAction, redactionForRow, storedFields } from './pending-actions.storage';
import type { ActionOrigin } from './pending-actions.types';
import { getActionHandler } from './registry';

/** Spec 4.5: unconfirmed actions expire after 10 minutes. */
export const ACTION_TTL_MS = 10 * 60 * 1000;

export interface CreateActionInput {
  userId: string;
  groupId: string | null;
  lang: Lang;
  origin: ActionOrigin;
  type: string;
  args: unknown;
}

/** `pendingAction.updated` to the owner's room (status and result only, never args). */
export function announce(action: PendingAction): void {
  emitToUser(action.userId, 'pendingAction.updated', toPendingActionUpdate(action));
}

async function reload(id: string): Promise<PendingAction> {
  return openAction(await getPrisma().pendingAction.findUniqueOrThrow({ where: { id } }));
}

/**
 * Checks the request through the handler's `prepare` (which refuses with an AppError) and stores
 * the server-built card. Nothing is executed.
 */
export async function createPendingAction(input: CreateActionInput): Promise<PendingAction> {
  const handler = getActionHandler(input.type);
  if (!handler) throw new Error(`No handler registered for ${input.type}`);
  const args = handler.args.parse(input.args);
  const now = clock.now();
  const ctx = { userId: input.userId, groupId: input.groupId, lang: input.lang, origin: input.origin, now, db: getPrisma() };
  const preview = actionPreviewSchema.parse(await handler.prepare(ctx, args));
  const row = await getPrisma().pendingAction.create({
    data: {
      userId: input.userId,
      groupId: input.groupId,
      type: handler.type,
      ...storedFields(handler, args, preview),
      level: handler.level,
      origin: input.origin,
      expiresAt: new Date(now.getTime() + ACTION_TTL_MS),
    },
  });
  const action = openAction(row);
  announce(action);
  return action;
}

/** Moves a PENDING row to a final status, redacting confidential content. True if it moved. */
async function finish(row: PendingAction, status: 'EXPIRED' | 'CANCELLED'): Promise<boolean> {
  const moved = await getPrisma().pendingAction.updateMany({
    where: { id: row.id, status: 'PENDING' },
    data: { status, completedAt: clock.now(), ...redactionForRow(row) },
  });
  return moved.count === 1;
}

async function expireIfDue(row: PendingAction): Promise<PendingAction> {
  if (row.status !== 'PENDING' || row.expiresAt.getTime() > clock.nowMs()) return openAction(row);
  const moved = await finish(row, 'EXPIRED');
  const fresh = await reload(row.id);
  if (moved) announce(fresh);
  return fresh;
}

/** The owner's action. Anyone else gets "not found". */
export async function getOwnPendingAction(userId: string, id: string): Promise<PendingAction> {
  const row = await getPrisma().pendingAction.findUnique({ where: { id } });
  if (!row) throw actionError('ACTION_NOT_FOUND');
  authorizeOwner(userId, 'pendingAction.read', row.userId);
  return expireIfDue(row);
}

export async function cancelPendingAction(userId: string, id: string): Promise<PendingAction> {
  const row = await getPrisma().pendingAction.findUnique({ where: { id } });
  if (!row) throw actionError('ACTION_NOT_FOUND');
  authorizeOwner(userId, 'pendingAction.cancel', row.userId);
  const current = await expireIfDue(row);
  if (current.status === 'CANCELLED') return current;
  if (current.status !== 'PENDING') throw notPendingError(current.status);
  const moved = await finish(row, 'CANCELLED');
  const fresh = await reload(id);
  if (!moved) throw notPendingError(fresh.status);
  announce(fresh);
  return fresh;
}

/** Job `pendingActions.expire` (spec 2.9): expires every overdue action. Returns how many. */
export async function expireDuePendingActions(now: Date = clock.now()): Promise<number> {
  const due = await getPrisma().pendingAction.findMany({
    where: { status: 'PENDING', expiresAt: { lte: now } },
    take: 500,
  });
  let expired = 0;
  for (const row of due) {
    if (await finish(row, 'EXPIRED')) {
      expired += 1;
      announce(await reload(row.id));
    }
  }
  return expired;
}

/**
 * For handlers that returned `processing`: records the final result once the external operation
 * settles (payment confirmed or failed). Only moves CONFIRMED actions, so it applies once. Call it
 * after the module's own transaction has committed.
 */
export async function completePendingAction(
  id: string,
  outcome:
    | { status: 'DONE'; resultRef?: string | null; summary?: { fr: string; en: string } | null }
    | { status: 'FAILED'; failureCode: string; failureText: { fr: string; en: string } },
): Promise<boolean> {
  const db = getPrisma();
  const row = await db.pendingAction.findUnique({ where: { id } });
  if (!row) return false;
  const now = clock.now();
  const data =
    outcome.status === 'DONE'
      ? {
          status: 'DONE' as const,
          completedAt: now,
          ...(outcome.resultRef !== undefined ? { resultRef: outcome.resultRef } : {}),
          ...(outcome.summary ? { resultSummary: outcome.summary } : {}),
        }
      : { status: 'FAILED' as const, completedAt: now, failureCode: outcome.failureCode, failureText: outcome.failureText };
  const updated = await db.pendingAction.updateMany({
    where: { id, status: 'CONFIRMED' },
    data: { ...data, ...redactionForRow(row) },
  });
  if (updated.count !== 1) return false;
  announce(await reload(id));
  return true;
}
