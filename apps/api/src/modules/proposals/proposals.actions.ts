// PROPOSAL_CREATE and VOTE_CAST (L1). Thresholds, eligibility, windows and vote validity come
// from @njangi/rules; wording from the designer's copy (confirmation.actions.*, notes.*).
import {
  canPropose,
  eligibleVoters,
  PROPOSAL_RULES,
  proposalWindowHours,
  thresholdCount,
  validateVote,
  voteClosesAt,
} from '@njangi/rules';
import { proposalTexts } from '@njangi/shared/i18n/server/proposals';
import { z } from 'zod';
import type { Db, Prisma } from '../../lib/prisma';
import { bilingual, ui } from '../../lib/texts';
import { authorizeGroup } from '../../permissions';
import { audit } from '../audit';
import { postSystemMessage } from '../chat';
import { createNotifications } from '../notifications';
import { defineActionHandler, type ActionContext } from '../pending-actions';
import { getCurrentParams } from '../rulesets';
import { proposalError } from './proposals.errors';
import { memberAddPayloadSchema, titleOf } from './proposals.payloads';
import { settleProposal } from './proposals.tally';

const VOTERS = ['ACTIVE', 'LEAVING'] as const;

export const proposalArgsSchema = z.strictObject({
  groupId: z.string().uuid(),
  type: z.literal('MEMBER_ADD'),
  payload: memberAddPayloadSchema,
  reason: z.string().max(500).nullable(),
});
export type ProposalArgs = z.infer<typeof proposalArgsSchema>;

/** What a new proposal would be: who votes, how many yes it needs, how long it stays open. */
async function planProposal(ctx: ActionContext, args: ProposalArgs, db: Db) {
  const access = await authorizeGroup(ctx.userId, args.groupId, 'group.proposals.create', db);
  if (access.group.status === 'FORMING') throw proposalError('PROPOSALS_BEFORE_FIRST_CYCLE');
  const allowed = canPropose({ type: args.type, proposerMembershipId: access.membership.id, subjectMembershipId: null });
  if (!allowed.ok) throw proposalError('NOT_ELIGIBLE_VOTER');
  const active = await db.membership.findMany({
    where: { groupId: args.groupId, status: { in: [...VOTERS] } },
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  const eligible = eligibleVoters({ type: args.type, activeMembershipIds: active.map((m) => m.id), excludedMembershipId: null });
  const rule = PROPOSAL_RULES[args.type];
  const hours = proposalWindowHours(args.type, await getCurrentParams(args.groupId, db));
  return { proposer: access.membership, eligible, rule, required: thresholdCount(rule.threshold, eligible.length), hours };
}

export const proposalCreateHandler = defineActionHandler({
  type: 'PROPOSAL_CREATE',
  level: 'L1',
  args: proposalArgsSchema,

  async prepare(ctx, args) {
    const plan = await planProposal(ctx, args, ctx.db);
    return {
      title: ui((c) => c.confirmation.actions.propose.title, { title: titleOf(args.type, args.payload) }),
      lines: [],
      total: null,
      notes: [
        ui((c) => c.confirmation.notes.threshold, { needed: plan.required, eligible: plan.eligible.length }),
        bilingual(proposalTexts.voteWindow, { hours: plan.hours }),
        ui((c) => c.newProposal.memberAdd.phoneHelp),
        ui((c) => c.newProposal.memberAdd.effect),
      ],
      confirmLabel: ui((c) => c.confirmation.actions.propose.button),
    };
  },

  async execute(ctx, args) {
    const plan = await planProposal(ctx, args, ctx.db);
    const proposal = await ctx.db.proposal.create({
      data: {
        groupId: args.groupId,
        type: args.type,
        payload: args.payload as Prisma.InputJsonValue,
        reason: args.reason,
        proposerMembershipId: plan.proposer.id,
        secret: plan.rule.secret,
        thresholdKind: plan.rule.threshold,
        eligibleMembershipIds: plan.eligible,
        opensAt: ctx.now,
        closesAt: voteClosesAt(ctx.now, plan.hours),
      },
      select: { id: true },
    });
    const title = titleOf(args.type, args.payload);
    await postSystemMessage(args.groupId, ui((c) => c.chat.system.voteOpened, { title }), ctx.effects, ctx.db);
    const voters = await ctx.db.membership.findMany({
      where: { id: { in: plan.eligible }, userId: { not: ctx.userId } },
      select: { userId: true },
    });
    await createNotifications(
      voters.map((v) => ({
        userId: v.userId,
        groupId: args.groupId,
        category: 'VOTES' as const,
        title: proposalTexts.openedTitle,
        body: ui((c) => c.chat.system.voteOpened, { title }),
        deepLink: `/votes/${proposal.id}`,
      })),
      ctx.effects,
      ctx.db,
    );
    await audit({ action: 'proposal.created', actorUserId: ctx.userId, groupId: args.groupId, target: `Proposal:${proposal.id}`, details: { type: args.type } }, ctx.db);
    return { outcome: 'done', resultRef: proposal.id, summary: ui((c) => c.confirmation.actions.propose.done) };
  },
});
