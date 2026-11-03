// Proposals and votes (spec 2.7, R11). Creating and voting return confirmation cards; reading
// returns views for the mapper, with the viewer's own vote (never anyone's secret choice).
import { thresholdCount } from '@njangi/rules';
import type { CastVoteRequest, CreateProposalRequest } from '@njangi/shared/contracts/proposals';
import { bilingualSchema } from '@njangi/shared/contracts/common';
import { hashPhone } from '../../lib/crypto';
import { clock } from '../../lib/clock';
import { getPrisma, type PendingAction, type Proposal } from '../../lib/prisma';
import { authorizeGroup, type AuthActor } from '../../permissions';
import type { ProposalView } from '../../dto';
import { createPendingAction } from '../pending-actions';
import type { ProposalArgs } from './proposals.actions';
import { proposalError } from './proposals.errors';
import { subjectOf } from './proposals.payloads';
import type { VoteArgs } from './votes.actions';

export async function requestProposal(actor: AuthActor, groupId: string, input: CreateProposalRequest): Promise<PendingAction> {
  const args: ProposalArgs = {
    groupId,
    type: input.type,
    payload: { inviteeName: input.name, phoneHash: hashPhone(input.phone) },
    reason: input.reason ?? null,
  };
  return createPendingAction({ userId: actor.userId, groupId, lang: actor.lang, origin: 'UI', type: 'PROPOSAL_CREATE', args });
}

export async function requestVote(actor: AuthActor, proposalId: string, input: CastVoteRequest): Promise<PendingAction> {
  const proposal = await getPrisma().proposal.findUnique({ where: { id: proposalId }, select: { groupId: true, secret: true } });
  if (!proposal) throw proposalError('PROPOSAL_NOT_FOUND');
  await authorizeGroup(actor.userId, proposal.groupId, 'group.proposals.read');
  const args: VoteArgs = { proposalId, choice: input.choice, secret: proposal.secret };
  return createPendingAction({ userId: actor.userId, groupId: proposal.groupId, lang: actor.lang, origin: 'UI', type: 'VOTE_CAST', args });
}

async function viewsFor(proposals: Proposal[], viewerMembershipId: string): Promise<ProposalView[]> {
  if (proposals.length === 0) return [];
  const prisma = getPrisma();
  const ids = proposals.map((p) => p.id);
  const nonSecretIds = proposals.filter((p) => !p.secret).map((p) => p.id);
  const [receipts, ballots, proposers] = await Promise.all([
    prisma.voteReceipt.findMany({ where: { proposalId: { in: ids }, membershipId: viewerMembershipId }, select: { proposalId: true } }),
    // Ballots exist only for non-secret proposals; never even query a secret one.
    prisma.ballot.findMany({ where: { proposalId: { in: nonSecretIds }, membershipId: viewerMembershipId }, select: { proposalId: true, choice: true } }),
    prisma.membership.findMany({
      where: { id: { in: [...new Set(proposals.map((p) => p.proposerMembershipId))] } },
      select: { id: true, user: { select: { name: true } } },
    }),
  ]);
  const voted = new Set(receipts.map((r) => r.proposalId));
  const choices = new Map(ballots.map((b) => [b.proposalId, b.choice]));
  const names = new Map(proposers.map((m) => [m.id, m.user.name]));
  const now = clock.nowMs();
  return proposals.map((proposal) => {
    const hasVoted = voted.has(proposal.id);
    const effect = bilingualSchema.safeParse(proposal.effect);
    return {
      proposal,
      subject: subjectOf(proposal.type, proposal.payload),
      proposerName: names.get(proposal.proposerMembershipId) ?? '',
      requiredYes: thresholdCount(proposal.thresholdKind, proposal.eligibleMembershipIds.length),
      viewer: {
        voted: hasVoted,
        ballot: proposal.secret ? null : (choices.get(proposal.id) ?? null),
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

export async function listProposals(userId: string, groupId: string): Promise<ProposalView[]> {
  const access = await authorizeGroup(userId, groupId, 'group.proposals.read');
  const proposals = await getPrisma().proposal.findMany({ where: { groupId }, orderBy: { opensAt: 'desc' }, take: 100 });
  return viewsFor(proposals, access.membership.id);
}

export async function getProposal(userId: string, proposalId: string): Promise<ProposalView> {
  const proposal = await getPrisma().proposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw proposalError('PROPOSAL_NOT_FOUND');
  const access = await authorizeGroup(userId, proposal.groupId, 'group.proposals.read');
  const [view] = await viewsFor([proposal], access.membership.id);
  return view!;
}
