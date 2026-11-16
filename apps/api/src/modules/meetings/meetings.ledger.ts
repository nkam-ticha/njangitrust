// R15.4: each publication of minutes is a ledger EVENT carrying the minutes' hash, sent through the
// same port governance uses for its EVENTs (`ledgerEventsPort`), so tests can record it and the
// money engineer's ledger service appends it to the hash chain when it registers.
import type { Bilingual } from '@njangi/shared';
import type { Prisma } from '../../lib/prisma';
import { ledgerEventsPort } from '../proposals';

export function recordMinutesPublished(
  tx: Prisma.TransactionClient,
  input: {
    groupId: string;
    meetingId: string;
    version: number;
    minutesHash: string;
    publishedByMembershipId: string;
    occurredAt: Date;
    description: Bilingual;
  },
): Promise<void> {
  return ledgerEventsPort().appendEvent(tx, {
    groupId: input.groupId,
    event: {
      event: 'MINUTES_PUBLISHED',
      meetingId: input.meetingId,
      version: input.version,
      minutesHash: input.minutesHash,
    },
    description: input.description,
    membershipId: input.publishedByMembershipId,
    refType: 'Meeting',
    refId: input.meetingId,
    occurredAt: input.occurredAt,
  });
}
