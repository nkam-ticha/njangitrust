// The confirm and cancel taps of a card (spec 4.5 steps 3 and 4), with the network and the cache
// passed in so the logic is testable. Rules:
//  - a tap whose answer is "already confirmed / cancelled / expired" is the card's real state, so
//    the flow reads the card again and reports that state instead of an error (a double tap, or the
//    same card open on two screens, is not a failure);
//  - any other failure leaves the card exactly as it was and is thrown to the screen.
import type { PendingActionDto } from '@njangi/shared/contracts/pending-actions';
import { asCancelled, furthest, isSettledElsewhere } from './actionState';

export interface CardStore {
  current(): PendingActionDto;
  /** Writes the card as given (a roll-back may move it backwards). */
  put(card: PendingActionDto): void;
  /** Reads the card again from the server. */
  fetchLatest(): Promise<PendingActionDto>;
}

export interface ConfirmOutcome {
  action: PendingActionDto;
  /** The action's one-time result (an invite link…); null when the answer was a re-read. */
  data: unknown;
  /** True when the server had already moved the card: `action` is its real state. */
  alreadyHandled: boolean;
}

async function readSettled(store: CardStore): Promise<PendingActionDto> {
  const latest = await store.fetchLatest();
  store.put(furthest(store.current(), latest));
  return store.current();
}

export async function confirmFlow(
  store: CardStore,
  post: () => Promise<{ action: PendingActionDto; data: unknown }>,
): Promise<ConfirmOutcome> {
  try {
    const answer = await post();
    store.put(furthest(store.current(), answer.action));
    return { action: answer.action, data: answer.data, alreadyHandled: false };
  } catch (error) {
    if (!isSettledElsewhere(error)) throw error;
    try {
      return { action: await readSettled(store), data: null, alreadyHandled: true };
    } catch {
      throw error;
    }
  }
}

export async function cancelFlow(
  store: CardStore,
  post: () => Promise<{ action: PendingActionDto }>,
): Promise<PendingActionDto> {
  const before = store.current();
  store.put(asCancelled(before));
  try {
    const answer = await post();
    store.put(answer.action);
    return answer.action;
  } catch (error) {
    // Back to what the server last told us, then the real state (it may be DONE, not cancelled).
    store.put(before);
    if (isSettledElsewhere(error)) {
      try {
        return await readSettled(store);
      } catch {
        // the roll-back above stands
      }
    }
    throw error;
  }
}
