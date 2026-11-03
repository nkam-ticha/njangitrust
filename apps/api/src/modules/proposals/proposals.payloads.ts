// Stored payloads per proposal type. They never hold a phone number in clear: MEMBER_ADD keeps the
// keyed hash that later binds the invite (spec 2.11).
import type { Bilingual } from '@njangi/shared';
import type { ProposalDto } from '@njangi/shared/contracts/proposals';
import { z } from 'zod';
import { ui } from '../../lib/texts';

export const memberAddPayloadSchema = z.strictObject({
  inviteeName: z.string().min(2).max(60),
  phoneHash: z.string().regex(/^[0-9a-f]{64}$/),
});
export type MemberAddPayload = z.infer<typeof memberAddPayloadSchema>;

export function readMemberAddPayload(payload: unknown): MemberAddPayload {
  return memberAddPayloadSchema.parse(payload);
}

/** The public subject of a proposal (allowlist: the hash never leaves the server). */
export function subjectOf(type: string, payload: unknown): ProposalDto['subject'] {
  if (type === 'MEMBER_ADD') return { type: 'MEMBER_ADD', inviteeName: readMemberAddPayload(payload).inviteeName };
  throw new Error(`No subject mapping for proposal type ${type}`);
}

/** The proposal's title in both languages ("Ajouter Hervé Kamga"), from the designer's copy. */
export function titleOf(type: string, payload: unknown): Bilingual {
  if (type === 'MEMBER_ADD') return ui((c) => c.votes.titles.memberAdd, { name: readMemberAddPayload(payload).inviteeName });
  throw new Error(`No title for proposal type ${type}`);
}
