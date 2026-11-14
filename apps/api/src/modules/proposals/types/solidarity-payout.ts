// SOLIDARITY_PAYOUT (R10, FSD SOL-01): any member asks support for a member's life event; the
// group votes by majority within solidarityVoteWindowHours; if passed, the money goes to the
// recipient's own number (paid by the money modules, after any number-change hold, D13.5).
import { validateSolidarityRequest } from '@njangi/rules';
import { textSchema } from '@njangi/shared/contracts/common';
import { solidarityEventSchema } from '@njangi/shared/contracts/solidarity';
import { z } from 'zod';
import { ui } from '../../../lib/texts';
import { moneyPort } from '../governance-ports';
import { proposalError } from '../proposals.errors';
import { appliedOn, defineProposal, memberRef, nameOf } from './definition';
import { amountText } from './money-proposals';

const payload = z.strictObject({
  recipientMembershipId: z.string().uuid(),
  event: solidarityEventSchema,
  amount: z.number().int().positive(),
  note: textSchema(300).nullable(),
});

export const solidarityPayout = defineProposal({
  type: 'SOLIDARITY_PAYOUT',
  input: payload,
  payload,

  async plan(ctx, args) {
    const port = moneyPort();
    if (!port) throw proposalError('PROPOSAL_TYPE_UNAVAILABLE');
    const recipientIsMember = ctx.activeMembers.some((m) => m.id === args.recipientMembershipId);
    const fund = await port.solidarityFund(ctx.db, ctx.group.id);
    const check = validateSolidarityRequest({
      amount: args.amount,
      event: args.event,
      solidarityFundBalance: fund.balance,
      pendingSolidarityPayouts: fund.pendingPayouts,
      feeSchedule: port.feeSchedule(),
      recipientIsMember,
    });
    if (!check.ok) {
      switch (check.code) {
        case 'ABOVE_SOLIDARITY_FUND':
          throw proposalError('SOLIDARITY_ABOVE_FUND', {
            params: { balance: amountText(check.balance) },
          });
        case 'AMOUNT_NOT_ABOVE_FEE':
          throw proposalError('SOLIDARITY_NOT_ABOVE_FEE', {
            params: { fee: amountText(check.feeEstimate) },
          });
        default:
          throw proposalError('RECIPIENT_NOT_MEMBER');
      }
    }
    return {
      payload: args,
      subjectMembershipId: null,
      excludedMembershipId: null,
      mustApprove: [],
      notes: [ui((c) => c.confirmation.notes.feeBorne)],
    };
  },

  describe(p, names) {
    return {
      title: ui((c) => c.votes.titles.solidarity, {
        amount: amountText(p.amount),
        name: nameOf(names, p.recipientMembershipId),
        event: ui((c2) => c2.caisse.solidarity.events[p.event]),
      }),
      subject: {
        type: 'SOLIDARITY_PAYOUT',
        recipient: memberRef(names, p.recipientMembershipId),
        event: p.event,
        amount: p.amount,
        note: p.note,
      },
    };
  },

  async afterCreate(tx, proposal, p) {
    await tx.solidarityRequest.create({
      data: {
        groupId: proposal.groupId,
        requesterMembershipId: proposal.proposerMembershipId,
        recipientMembershipId: p.recipientMembershipId,
        event: p.event,
        amount: p.amount,
        note: p.note,
        proposalId: proposal.id,
        status: 'VOTING',
      },
    });
  },

  async apply(ctx) {
    const request = await ctx.tx.solidarityRequest.update({
      where: { proposalId: ctx.proposal.id },
      data: { status: 'APPROVED' },
    });
    const port = moneyPort();
    if (port)
      await port.paySolidarity(ctx.tx, {
        groupId: ctx.group.id,
        solidarityRequestId: request.id,
        proposalId: ctx.proposal.id,
      });
    return appliedOn(ctx.now);
  },

  async onNotPassed(ctx) {
    await ctx.tx.solidarityRequest.update({
      where: { proposalId: ctx.proposal.id },
      data: { status: 'REJECTED' },
    });
  },
});
