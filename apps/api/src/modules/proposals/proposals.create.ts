// Preparing and opening a proposal of any type (R11.1, R11.3, 3.1). The voters, the threshold and
// the closing time are fixed here, once, from @njangi/rules.
import {
  canPropose,
  eligibleVoters,
  PROPOSAL_RULES,
  proposalWindowHours,
  thresholdCount,
  voteClosesAt,
  voteReminderAt,
  type ProposalType,
} from '@njangi/rules';
import type { Bilingual } from '@njangi/shared';
import type { ActionPreview } from '@njangi/shared/contracts/pending-actions';
import { proposalTexts } from '@njangi/shared/i18n/server/proposals';
import { noticeBody } from './proposals.notices';
import type { EffectSink } from '../../lib/after-commit';
import type { Prisma, Proposal } from '../../lib/prisma';
import { bilingual, ui } from '../../lib/texts';
import { dispatchJob } from '../../jobs/dispatch';
import { audit } from '../audit';
import { postSystemMessage } from '../chat';
import { createNotifications } from '../notifications';
import { proposalError } from './proposals.errors';
import { proposalDefinition, type PlanContext, type ProposalDefinition } from './types';

export interface PreparedProposal {
  type: ProposalType;
  definition: ProposalDefinition<unknown, unknown>;
  payload: unknown;
  subjectMembershipId: string | null;
  mustApprove: string[];
  notes: Bilingual[];
  eligible: string[];
  required: number;
  windowHours: number;
  title: Bilingual;
}

/** Every check of a new proposal; changes nothing. `system`: opened by the app (ADMIN_LOAN). */
export async function prepareProposal(
  ctx: PlanContext,
  type: ProposalType,
  rawInput: unknown,
  options: { system?: boolean } = {},
): Promise<PreparedProposal> {
  const definition = proposalDefinition(type);
  if (!options.system) {
    const allowed = canPropose({
      type,
      proposerMembershipId: ctx.proposer.id,
      subjectMembershipId: type === 'EARLY_EXIT' ? ctx.proposer.id : null,
    });
    if (!allowed.ok) throw proposalError('ADMIN_LOAN_NOT_PROPOSABLE');
  }
  const plan = await definition.plan(ctx, definition.input.parse(rawInput));
  const eligible = eligibleVoters({
    type,
    activeMembershipIds: ctx.activeMembers.map((m) => m.id),
    excludedMembershipId: plan.excludedMembershipId,
  });
  return {
    type,
    definition,
    payload: definition.payload.parse(plan.payload),
    subjectMembershipId: plan.subjectMembershipId,
    mustApprove: plan.mustApprove,
    notes: plan.notes,
    eligible,
    required: thresholdCount(PROPOSAL_RULES[type].threshold, eligible.length),
    windowHours: proposalWindowHours(type, ctx.params),
    title: definition.describe(plan.payload, ctx.names).title,
  };
}

/** The confirmation card of PROPOSAL_CREATE (designer copy confirmation.actions.propose). */
export function proposalCard(p: PreparedProposal): ActionPreview {
  const counts = { needed: p.required, eligible: p.eligible.length };
  const threshold =
    PROPOSAL_RULES[p.type].threshold === 'MAJORITY'
      ? ui((c) => c.votes.threshold.majority, counts)
      : ui((c) => c.votes.threshold.twoThirds, counts);
  return {
    title: ui((c) => c.confirmation.actions.propose.title, { title: p.title }),
    lines: [],
    total: null,
    notes: [
      threshold,
      bilingual(
        PROPOSAL_RULES[p.type].secret ? proposalTexts.voteWindowSecret : proposalTexts.voteWindow,
        { hours: p.windowHours },
      ),
      ...(PROPOSAL_RULES[p.type].secret ? [ui((c) => c.confirmation.notes.voteSecret)] : []),
      ...p.notes,
    ],
    confirmLabel: ui((c) => c.confirmation.actions.propose.button),
  };
}

/** Opens the vote: the proposal row, its type's records, the chat event, notifications, jobs. */
export async function openProposal(
  tx: Prisma.TransactionClient,
  ctx: PlanContext,
  p: PreparedProposal,
  reason: string | null,
  effects: EffectSink,
): Promise<Proposal> {
  const rule = PROPOSAL_RULES[p.type];
  const proposal = await tx.proposal.create({
    data: {
      groupId: ctx.group.id,
      type: p.type,
      payload: p.payload as Prisma.InputJsonValue,
      reason,
      proposerMembershipId: ctx.proposer.id,
      subjectMembershipId: p.subjectMembershipId,
      secret: rule.secret,
      thresholdKind: rule.threshold,
      eligibleMembershipIds: p.eligible,
      mustApproveMembershipIds: p.mustApprove,
      opensAt: ctx.now,
      closesAt: voteClosesAt(ctx.now, p.windowHours),
    },
  });
  await p.definition.afterCreate?.(tx, proposal, p.payload);
  const opened = ui((c) => c.chat.system.voteOpened, { title: p.title });
  await postSystemMessage(ctx.group.id, opened, effects, tx);
  const voters = ctx.activeMembers.filter(
    (m) => p.eligible.includes(m.id) && m.id !== ctx.proposer.id,
  );
  await createNotifications(
    voters.map((v) => ({
      userId: v.userId,
      groupId: ctx.group.id,
      category: 'VOTES' as const,
      title: proposalTexts.openedTitle,
      body: noticeBody(p.type, 'opened', ctx.group, opened),
      deepLink: `/votes/${proposal.id}`,
    })),
    effects,
    tx,
  );
  await audit(
    {
      action: 'proposal.created',
      actorUserId: ctx.userId,
      groupId: ctx.group.id,
      target: `Proposal:${proposal.id}`,
      details: { type: p.type },
    },
    tx,
  );
  effects.add(() => scheduleProposalJobs(proposal));
  return proposal;
}

/** R11.3, spec 2.9: close at `closesAt`, remind 24 hours before. */
export async function scheduleProposalJobs(
  proposal: Pick<Proposal, 'id' | 'opensAt' | 'closesAt'>,
): Promise<void> {
  await dispatchJob(
    'votes.close',
    { proposalId: proposal.id },
    { jobId: `close-${proposal.id}`, at: proposal.closesAt },
  );
  const remindAt = voteReminderAt(proposal.closesAt);
  if (remindAt > proposal.opensAt) {
    await dispatchJob(
      'votes.remind',
      { proposalId: proposal.id },
      { jobId: `remind-${proposal.id}`, at: remindAt },
    );
  }
}
