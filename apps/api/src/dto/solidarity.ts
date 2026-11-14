// Solidarity request mapper (R10.2: the note is visible to the group; never a number).
import type { SolidarityRequestItem } from '@njangi/shared/contracts/solidarity';
import { iso } from './time';

export interface SolidarityRequestSource {
  id: string;
  proposalId: string | null;
  event: SolidarityRequestItem['event'];
  amount: number;
  note: string | null;
  status: SolidarityRequestItem['status'];
  createdAt: Date;
  recipient: { id: string; user: { name: string } };
  requester: { id: string; user: { name: string } };
}

export function toSolidarityRequest(r: SolidarityRequestSource): SolidarityRequestItem {
  return {
    id: r.id,
    proposalId: r.proposalId,
    recipient: { membershipId: r.recipient.id, name: r.recipient.user.name },
    requester: { membershipId: r.requester.id, name: r.requester.user.name },
    event: r.event,
    amount: r.amount,
    note: r.note,
    status: r.status,
    createdAt: iso(r.createdAt),
  };
}
