// Cards that arrive with a conversation (or with `agent.done`) are written into the card cache, so
// every ActionCard shows the server's latest state at once and does not fetch its card again. A
// card already further along in the cache is never moved back by an older copy (actionState.ts).
import type { QueryClient } from '@tanstack/react-query';
import type { PendingActionDto } from '@njangi/shared/contracts/pending-actions';
import { furthest, pendingActionKey } from './actionState';

export function seedPendingActions(qc: QueryClient, actions: readonly PendingActionDto[]): void {
  for (const incoming of actions) {
    const current = qc.getQueryData<PendingActionDto>(pendingActionKey(incoming.id));
    const next = furthest(current, incoming);
    if (current && JSON.stringify(current) === JSON.stringify(next)) continue;
    qc.setQueryData(pendingActionKey(incoming.id), next);
  }
}
