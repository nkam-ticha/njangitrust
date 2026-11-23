// How a card's state moves (spec 4.5). A card only goes forward: PENDING, then CONFIRMED (the
// operator is working), then one final state. A late or repeated message ("still PENDING", sent
// when the card was created) must never pull a card back. Pure: no React, no network.
import type {
  PendingActionDto,
  PendingActionStatus,
} from '@njangi/shared/contracts/pending-actions';
import type { PendingActionUpdatedPayload } from '@njangi/shared/contracts/realtime';

/** The query-cache key of one card. */
export const pendingActionKey = (id: string) => ['pendingAction', id] as const;

const RANK: Record<PendingActionStatus, number> = {
  PENDING: 0,
  CONFIRMED: 1,
  DONE: 2,
  FAILED: 2,
  CANCELLED: 2,
  EXPIRED: 2,
};

export const isFinalStatus = (status: PendingActionStatus) => RANK[status] === 2;

/** Whether a card in state `from` may move to state `to`. The first final state wins. */
export function mayMove(from: PendingActionStatus, to: PendingActionStatus): boolean {
  if (RANK[to] > RANK[from]) return true;
  if (RANK[to] < RANK[from]) return false;
  return from === to;
}

/** A `pendingAction.updated` message applied to the card it names. */
export function applyUpdate(
  card: PendingActionDto,
  update: PendingActionUpdatedPayload,
): PendingActionDto {
  if (update.id !== card.id || !mayMove(card.status, update.status)) return card;
  return { ...card, status: update.status, result: update.result, failure: update.failure };
}

/** Of two readings of the same card, the one further along; the incoming one on a tie. */
export function furthest(
  current: PendingActionDto | undefined,
  incoming: PendingActionDto,
): PendingActionDto {
  if (!current || current.id !== incoming.id) return incoming;
  return mayMove(current.status, incoming.status) ? incoming : current;
}

/**
 * Codes that mean "this card already left PENDING": the same card was confirmed a moment ago (a
 * second tap, another screen showing it), cancelled, or expired. They are a state to show, never an
 * error to report.
 */
const SETTLED = new Set([
  'ACTION_ALREADY_CONFIRMED',
  'ACTION_NOT_PENDING',
  'ACTION_CANCELLED',
  'ACTION_EXPIRED',
]);

export function isSettledElsewhere(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && SETTLED.has(code);
}

/** The card as the member sees it the instant they cancel it, before the server has answered. */
export function asCancelled(card: PendingActionDto): PendingActionDto {
  return { ...card, status: 'CANCELLED', result: null, failure: null };
}
