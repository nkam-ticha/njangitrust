// VOTE_CAST (L1, R11.4, R11.5). One vote per eligible member, never changed. For a secret
// proposal the receipt and the counter are written in one transaction and no Ballot exists.
import { validateVote } from '@njangi/rules';
import { z } from 'zod';
import type { Db } from '../../lib/prisma';
import { proposalTexts } from '@njangi/shared/i18n/server/proposals';
import { ui } from '../../lib/texts';
import { authorizeGroup } from '../../permissions';
import { defineActionHandler, type ActionContext } from '../pending-actions';
import { proposalError } from './proposals.errors';
import { titleOf } from './proposals.payloads';
import { settleProposal } from './proposals.tally';

export const voteArgsSchema = z.strictObject({
  proposalId: z.string().uuid(),
  choice: z.enum(['YES', 'NO']),
  /** Copied from the proposal by the service; a secret vote's card is confidential. */
  secret: z.boolean(),
});
export type VoteArgs = z.infer<typeof voteArgsSchema>;

const REFUSALS = {
  NOT_ELIGIBLE_VOTER: 'NOT_ELIGIBLE_VOTER',
  ALREADY_VOTED: 'ALREADY_VOTED',
  PROPOSAL_CLOSED: 'PROPOSAL_CLOSED',
} as const;

/** Every check of a vote; returns the proposal and the voter's membership. */
async function checkVote(ctx: ActionContext, args: VoteArgs, db: Db) {
  const proposal = await db.proposal.findUnique({ where: { id: args.proposalId } });
  if (!proposal) throw proposalError('PROPOSAL_NOT_FOUND');
  const access = await authorizeGroup(ctx.userId, proposal.groupId, 'group.votes.cast', db);
  const receipt = await db.voteReceipt.findUnique({
    where: { proposalId_membershipId: { proposalId: proposal.id, membershipId: access.membership.id } },
    select: { id: true },
  });
  const check = validateVote({
    eligibleVoterIds: proposal.eligibleMembershipIds,
    voterId: access.membership.id,
    alreadyVoted: receipt !== null,
    status: proposal.status,
    closesAt: proposal.closesAt,
    now: ctx.now,
  });
  if (!check.ok) throw proposalError(REFUSALS[check.code]);
  if (proposal.secret !== args.secret) throw proposalError('PROPOSAL_NOT_FOUND');
  return { proposal, membershipId: access.membership.id };
}

export const voteCastHandler = defineActionHandler({
  type: 'VOTE_CAST',
  level: 'L1',
  args: voteArgsSchema,

  async prepare(ctx, args) {
    const { proposal } = await checkVote(ctx, args, ctx.db);
    const yes = args.choice === 'YES';
    return {
      title: ui((c) => (yes ? c.confirmation.actions.voteYes.title : c.confirmation.actions.voteNo.title)),
      lines: [],
      total: null,
      notes: [
        titleOf(proposal.type, proposal.payload),
        ...(proposal.secret ? [ui((c) => c.confirmation.notes.voteSecret)] : []),
        ui((c) => c.confirmation.notes.voteFinal),
      ],
      confirmLabel: ui((c) => (yes ? c.confirmation.actions.voteYes.button : c.confirmation.actions.voteNo.button)),
    };
  },

  // R11.5: while pending, the choice is sealed; once finished, only a neutral card remains, so no
  // stored row ever links a secret choice to the member.
  confidential: (args) => args.secret,
  redacted: (args) => ({
    args: { proposalId: args.proposalId, secret: true },
    preview: {
      title: proposalTexts.secretVoteSealed,
      lines: [],
      total: null,
      notes: [ui((c) => c.confirmation.notes.voteSecret)],
      confirmLabel: proposalTexts.secretVoteSealed,
    },
  }),

  async execute(ctx, args) {
    // One vote at a time per proposal, so the tally that closes it is exact.
    await ctx.db.$queryRaw`SELECT "id" FROM "Proposal" WHERE "id" = ${args.proposalId}::uuid FOR UPDATE`;
    const { proposal, membershipId } = await checkVote(ctx, args, ctx.db);
    const receipt = await ctx.db.voteReceipt.create({
      data: { proposalId: proposal.id, membershipId, votedAt: ctx.now },
      select: { id: true },
    });
    if (!proposal.secret) {
      await ctx.db.ballot.create({ data: { proposalId: proposal.id, membershipId, choice: args.choice, castAt: ctx.now } });
    }
    await ctx.db.proposal.update({
      where: { id: proposal.id },
      data: args.choice === 'YES' ? { yesCount: { increment: 1 } } : { noCount: { increment: 1 } },
    });
    await settleProposal(ctx.db, proposal.id, ctx.now, ctx.effects);
    // The audit records that a vote happened, never the choice.
    return {
      outcome: 'done',
      resultRef: receipt.id,
      summary: ui((c) => (args.choice === 'YES' ? c.confirmation.actions.voteYes.done : c.confirmation.actions.voteNo.done)),
    };
  },
});
