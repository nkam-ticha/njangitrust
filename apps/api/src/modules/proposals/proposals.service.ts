// Proposals and votes (spec 2.7, R11, FSD GOV-01..04). Creating and voting return confirmation
// cards; reading returns views for the mapper, with the viewer's own vote, never anyone's secret
// choice. Every function acts as the given user, so agent tools can wrap them unchanged.
import { thresholdCount } from '@njangi/rules';
import type { CastVoteRequest, CreateProposalRequest } from '@njangi/shared/contracts/proposals';
import type { SolidarityRequestInput } from '@njangi/shared/contracts/solidarity';
import { bilingualSchema } from '@njangi/shared/contracts/common';
import type { EffectSink } from '../../lib/after-commit';
import { clock } from '../../lib/clock';
import { hashPhone } from '../../lib/crypto';
import { getPrisma, type PendingAction, type Prisma, type Proposal } from '../../lib/prisma';
import { authorizeGroup, type AuthActor } from '../../permissions';
import type { ProposalView } from '../../dto';
import { createPendingAction, type ActionOrigin } from '../pending-actions';
import type { ProposalArgs } from './proposals.actions';
import { memberNames, planContext } from './proposals.context';
import { openProposal, prepareProposal } from './proposals.create';
import { proposalError } from './proposals.errors';
import { proposalDefinition } from './types';
import type { VoteArgs } from './votes.actions';

/** The type's input, normalised: the phone becomes a keyed hash, ids stay ids. */
function normalise(request: CreateProposalRequest): ProposalArgs['input'] {
  switch (request.type) {
    case 'MEMBER_ADD':
      return { inviteeName: request.name, phoneHash: hashPhone(request.phone) };
    case 'RULE_CHANGE':
      return { changes: request.changes };
    case 'MEMBER_REMOVE':
    case 'ADMIN_CHANGE':
      return { membershipId: request.membershipId };
    case 'ROTATION_CHANGE':
      return { swap: request.swap };
    case 'EARLY_EXIT':
      return {};
    case 'FINE_WAIVER':
      return { obligationId: request.fineId };
    case 'LEDGER_CORRECTION':
      return { seq: request.seq, correction: request.correction };
  }
}

export async function requestProposal(
  actor: AuthActor,
  groupId: string,
  request: CreateProposalRequest,
  origin: ActionOrigin = 'UI',
): Promise<PendingAction> {
  const args: ProposalArgs = {
    groupId,
    type: request.type,
    input: normalise(request),
    reason: request.reason ?? null,
  };
  return createPendingAction({
    userId: actor.userId,
    groupId,
    lang: actor.lang,
    origin,
    type: 'PROPOSAL_CREATE',
    args,
  });
}

/** R10.2: a solidarity request is a SOLIDARITY_PAYOUT proposal. */
export async function requestSolidarity(
  actor: AuthActor,
  groupId: string,
  request: SolidarityRequestInput,
  origin: ActionOrigin = 'UI',
): Promise<PendingAction> {
  const args: ProposalArgs = {
    groupId,
    type: 'SOLIDARITY_PAYOUT',
    input: { ...request, note: request.note ?? null },
    reason: null,
  };
  return createPendingAction({
    userId: actor.userId,
    groupId,
    lang: actor.lang,
    origin,
    type: 'PROPOSAL_CREATE',
    args,
  });
}

export async function requestVote(
  actor: AuthActor,
  proposalId: string,
  input: CastVoteRequest,
  origin: ActionOrigin = 'UI',
): Promise<PendingAction> {
  const proposal = await getPrisma().proposal.findUnique({
    where: { id: proposalId },
    select: { groupId: true, secret: true },
  });
  if (!proposal) throw proposalError('PROPOSAL_NOT_FOUND');
  await authorizeGroup(actor.userId, proposal.groupId, 'group.proposals.read');
  const args: VoteArgs = { proposalId, choice: input.choice, secret: proposal.secret };
  return createPendingAction({
    userId: actor.userId,
    groupId: proposal.groupId,
    lang: actor.lang,
    origin,
    type: 'VOTE_CAST',
    args,
  });
}

/**
 * R7.4: opened by the loans module, inside its own transaction, when the admin asks for a loan.
 * The admin is excluded from the vote.
 */
export async function openAdminLoanProposal(
  tx: Prisma.TransactionClient,
  input: {
    adminUserId: string;
    groupId: string;
    loanId: string;
    membershipId: string;
    amount: number;
    months: number;
  },
  effects: EffectSink,
): Promise<Proposal> {
  const ctx = await planContext(tx, input.adminUserId, input.groupId, clock.now());
  const { adminUserId: _admin, groupId: _group, ...payload } = input;
  const prepared = await prepareProposal(ctx, 'ADMIN_LOAN', payload, { system: true });
  return openProposal(tx, ctx, prepared, null, effects);
}

async function viewsFor(
  proposals: Proposal[],
  viewerMembershipId: string,
  groupId: string,
): Promise<ProposalView[]> {
  if (proposals.length === 0) return [];
  const prisma = getPrisma();
  const ids = proposals.map((p) => p.id);
  const openIds = proposals.filter((p) => !p.secret).map((p) => p.id);
  const [receipts, ballots, names] = await Promise.all([
    prisma.voteReceipt.findMany({
      where: { proposalId: { in: ids }, membershipId: viewerMembershipId },
      select: { proposalId: true },
    }),
    // Ballots exist only for non-secret proposals; a secret one is never even queried.
    prisma.ballot.findMany({
      where: { proposalId: { in: openIds } },
      select: { proposalId: true, membershipId: true, choice: true },
      orderBy: { createdAt: 'asc' },
    }),
    memberNames(prisma, groupId),
  ]);
  const voted = new Set(receipts.map((r) => r.proposalId));
  const now = clock.nowMs();
  return proposals.map((proposal) => {
    const definition = proposalDefinition(proposal.type);
    const { title, subject } = definition.describe(
      definition.payload.parse(proposal.payload),
      names,
    );
    const hasVoted = voted.has(proposal.id);
    const mine = proposal.secret
      ? null
      : (ballots.find((b) => b.proposalId === proposal.id && b.membershipId === viewerMembershipId)
          ?.choice ?? null);
    const effect = bilingualSchema.safeParse(proposal.effect);
    return {
      proposal,
      title,
      subject,
      proposerName: names.get(proposal.proposerMembershipId) ?? '',
      requiredYes: thresholdCount(proposal.thresholdKind, proposal.eligibleMembershipIds.length),
      mustApprove: proposal.mustApproveMembershipIds.map((id) => ({
        membershipId: id,
        name: names.get(id) ?? '',
      })),
      ballots: proposal.secret
        ? null
        : ballots
            .filter((b) => b.proposalId === proposal.id)
            .map((b) => ({
              member: { membershipId: b.membershipId, name: names.get(b.membershipId) ?? '' },
              choice: b.choice,
            })),
      viewer: {
        voted: hasVoted,
        ballot: mine,
        canVote:
          proposal.status === 'OPEN' &&
          proposal.closesAt.getTime() > now &&
          !hasVoted &&
          proposal.eligibleMembershipIds.includes(viewerMembershipId),
      },
      effect: effect.success ? effect.data : null,
    };
  });
}

export async function listProposals(
  userId: string,
  groupId: string,
  filter: { status?: 'OPEN' | 'CLOSED' } = {},
): Promise<ProposalView[]> {
  const access = await authorizeGroup(userId, groupId, 'group.proposals.read');
  const status =
    filter.status === 'OPEN'
      ? 'OPEN'
      : filter.status === 'CLOSED'
        ? { not: 'OPEN' as const }
        : undefined;
  const proposals = await getPrisma().proposal.findMany({
    where: { groupId, ...(status ? { status } : {}) },
    orderBy: { opensAt: 'desc' },
    take: 100,
  });
  return viewsFor(proposals, access.membership.id, groupId);
}

export async function getProposal(userId: string, proposalId: string): Promise<ProposalView> {
  const proposal = await getPrisma().proposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw proposalError('PROPOSAL_NOT_FOUND');
  const access = await authorizeGroup(userId, proposal.groupId, 'group.proposals.read');
  const [view] = await viewsFor([proposal], access.membership.id, proposal.groupId);
  return view!;
}
