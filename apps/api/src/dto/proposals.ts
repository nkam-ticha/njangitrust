// Proposal mapper (R11.5). A secret proposal shows only participation while open, and the
// viewer's own vote only as "VOTED": nothing that could link a choice to a member.
import type { Bilingual } from '@njangi/shared';
import type { ProposalDto } from '@njangi/shared/contracts/proposals';
import { visibleTally } from '@njangi/rules';
import type { Proposal } from '../lib/prisma';
import { iso, isoOrNull } from './time';

export interface ProposalView {
  proposal: Proposal;
  subject: ProposalDto['subject'];
  proposerName: string;
  requiredYes: number;
  viewer: {
    /** The viewer has a VoteReceipt. */
    voted: boolean;
    /** The viewer's Ballot choice, only ever loaded for non-secret proposals. */
    ballot: 'YES' | 'NO' | null;
    canVote: boolean;
  };
  effect: Bilingual | null;
}

export function toProposal(view: ProposalView): ProposalDto {
  const p = view.proposal;
  const tally = visibleTally({ secret: p.secret, status: p.status, yes: p.yesCount, no: p.noCount });
  const myVote = p.secret ? (view.viewer.voted ? 'VOTED' : null) : view.viewer.ballot;
  return {
    id: p.id,
    groupId: p.groupId,
    type: p.type,
    status: p.status,
    secret: p.secret,
    subject: view.subject,
    reason: p.reason,
    proposer: { membershipId: p.proposerMembershipId, name: view.proposerName },
    thresholdKind: p.thresholdKind,
    requiredYes: view.requiredYes,
    eligibleCount: p.eligibleMembershipIds.length,
    participation: tally.voted,
    tally: tally.yes === undefined || tally.no === undefined ? null : { yes: tally.yes, no: tally.no },
    myVote,
    canVote: view.viewer.canVote,
    opensAt: iso(p.opensAt),
    closesAt: iso(p.closesAt),
    closedAt: isoOrNull(p.closedAt),
    effect: view.effect,
  };
}
