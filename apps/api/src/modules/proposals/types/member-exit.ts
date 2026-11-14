// MEMBER_REMOVE (secret, majority, target excluded) and EARLY_EXIT (majority, requester excluded):
// R11.1, R12.3, FSD MEM-02, GOV-03. The admin must first be replaced by an ADMIN_CHANGE.
import { z } from 'zod';
import { ui } from '../../../lib/texts';
import { proposalError } from '../proposals.errors';
import { appliedOn, defineProposal, memberRef, nameOf } from './definition';
import { assertNoOpenProposalAbout, endMembership, requireMoneyPort } from './membership-end';

const memberPayload = z.strictObject({ membershipId: z.string().uuid() });

export const memberRemove = defineProposal({
  type: 'MEMBER_REMOVE',
  input: memberPayload,
  payload: memberPayload,

  async plan(ctx, args) {
    const target = await ctx.db.membership.findFirst({
      where: {
        id: args.membershipId,
        groupId: ctx.group.id,
        status: { in: ['INVITED', 'ACTIVE', 'LEAVING'] },
      },
      select: { id: true, role: true, status: true },
    });
    if (!target) throw proposalError('MEMBER_NOT_FOUND');
    if (target.id === ctx.proposer.id) throw proposalError('CANNOT_TARGET_SELF');
    if (target.role === 'ADMIN') throw proposalError('ADMIN_MUST_CHANGE_FIRST');
    if (target.status !== 'INVITED') requireMoneyPort();
    await assertNoOpenProposalAbout(ctx, 'MEMBER_REMOVE', target.id);
    return {
      payload: args,
      subjectMembershipId: target.id,
      excludedMembershipId: target.id,
      mustApprove: [],
      notes: [ui((c) => c.newProposal.memberRemove.note)],
    };
  },

  describe(p, names) {
    return {
      title: ui((c) => c.votes.titles.memberRemove, { name: nameOf(names, p.membershipId) }),
      subject: { type: 'MEMBER_REMOVE', member: memberRef(names, p.membershipId) },
    };
  },

  async apply(ctx, p) {
    await endMembership(ctx, { membershipId: p.membershipId, reason: 'REMOVED' });
    return appliedOn(ctx.now);
  },
});

export const earlyExit = defineProposal({
  type: 'EARLY_EXIT',
  input: z.strictObject({}),
  payload: memberPayload,

  async plan(ctx) {
    if (ctx.proposer.role === 'ADMIN') throw proposalError('ADMIN_MUST_CHANGE_FIRST');
    requireMoneyPort();
    await assertNoOpenProposalAbout(ctx, 'EARLY_EXIT', ctx.proposer.id);
    return {
      payload: { membershipId: ctx.proposer.id },
      subjectMembershipId: ctx.proposer.id,
      excludedMembershipId: ctx.proposer.id,
      mustApprove: [],
      notes: [ui((c) => c.confirmation.notes.earlyExitSettlement)],
    };
  },

  describe(p, names) {
    return {
      title: ui((c) => c.votes.titles.earlyExit, { name: nameOf(names, p.membershipId) }),
      subject: { type: 'EARLY_EXIT', member: memberRef(names, p.membershipId) },
    };
  },

  async apply(ctx, p) {
    await endMembership(ctx, { membershipId: p.membershipId, reason: 'EARLY_EXIT' });
    return appliedOn(ctx.now);
  },
});
