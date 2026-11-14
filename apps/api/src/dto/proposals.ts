// Proposal mapper (R11.5, FSD GOV-03, AC-07). A secret proposal shows only participation while
// open, never who voted what (the mapper forces `votes` to null whatever it is given), and the
// viewer's own vote only as "VOTED".
import type { Bilingual } from '@njangi/shared';
import type {
  MemberRefDto,
  ProposalDto,
  ProposalSubjectDto,
} from '@njangi/shared/contracts/proposals';
import { visibleTally } from '@njangi/rules';
import type { Proposal } from '../lib/prisma';
import { iso, isoOrNull } from './time';

export interface ProposalView {
  proposal: Proposal;
  title: Bilingual;
  subject: ProposalSubjectDto;
  proposerName: string;
  requiredYes: number;
  mustApprove: MemberRefDto[];
  /** Who voted what; only ever loaded for non-secret proposals. */
  ballots: { member: MemberRefDto; choice: 'YES' | 'NO' }[] | null;
  viewer: {
    voted: boolean;
    /** The viewer's Ballot choice, only ever loaded for non-secret proposals. */
    ballot: 'YES' | 'NO' | null;
    canVote: boolean;
  };
  effect: Bilingual | null;
}

export function toProposal(view: ProposalView): ProposalDto {
  const p = view.proposal;
  const tally = visibleTally({
    secret: p.secret,
    status: p.status,
    yes: p.yesCount,
    no: p.noCount,
  });
  return {
    id: p.id,
    groupId: p.groupId,
    type: p.type,
    status: p.status,
    secret: p.secret,
    title: view.title,
    subject: view.subject,
    reason: p.reason,
    proposer: { membershipId: p.proposerMembershipId, name: view.proposerName },
    thresholdKind: p.thresholdKind,
    requiredYes: view.requiredYes,
    eligibleCount: p.eligibleMembershipIds.length,
    mustApprove: view.mustApprove,
    participation: tally.voted,
    tally:
      tally.yes === undefined || tally.no === undefined ? null : { yes: tally.yes, no: tally.no },
    votes: p.secret ? null : (view.ballots ?? []),
    myVote: p.secret ? (view.viewer.voted ? 'VOTED' : null) : view.viewer.ballot,
    canVote: view.viewer.canVote,
    opensAt: iso(p.opensAt),
    closesAt: iso(p.closesAt),
    closedAt: isoOrNull(p.closedAt),
    effect: view.effect,
  };
}
