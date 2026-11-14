// MEMBER_ADD (R11.1, R12.1, FSD MEM-01): majority; if passed, the admin creates the invite and the
// person becomes active from the next cycle. The phone is kept only as a keyed hash.
import { proposalTexts } from '@njangi/shared/i18n/server/proposals';
import { nameSchema } from '@njangi/shared/contracts/common';
import { z } from 'zod';
import { bilingual, ui } from '../../../lib/texts';
import { defineProposal } from './definition';

export const memberAddPayloadSchema = z.strictObject({
  inviteeName: nameSchema(),
  phoneHash: z.string().regex(/^[0-9a-f]{64}$/),
});
export type MemberAddPayload = z.infer<typeof memberAddPayloadSchema>;

/** MEMBER_ADD's stored payload (the invite checks the phone hash against it). */
export function readMemberAddPayload(payload: unknown): MemberAddPayload {
  return memberAddPayloadSchema.parse(payload);
}

export const memberAdd = defineProposal({
  type: 'MEMBER_ADD',
  input: memberAddPayloadSchema,
  payload: memberAddPayloadSchema,

  plan(_ctx, input) {
    return Promise.resolve({
      payload: input,
      subjectMembershipId: null,
      excludedMembershipId: null,
      mustApprove: [],
      notes: [
        ui((c) => c.newProposal.memberAdd.phoneHelp),
        ui((c) => c.newProposal.memberAdd.effect),
      ],
    });
  },

  describe(payload) {
    return {
      title: ui((c) => c.votes.titles.memberAdd, { name: payload.inviteeName }),
      subject: { type: 'MEMBER_ADD', inviteeName: payload.inviteeName },
    };
  },

  apply(_ctx, payload) {
    return Promise.resolve(
      bilingual(proposalTexts.effectInviteAllowed, { name: payload.inviteeName }),
    );
  },
});
