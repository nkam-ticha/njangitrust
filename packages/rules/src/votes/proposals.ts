// Proposal types (R11.1), eligible voters (3.1) and vote windows (R11.3).

import type { Refusal } from '../result';
import type { RuleSetParams } from '../ruleset';

export type ProposalType =
  | 'RULE_CHANGE'
  | 'MEMBER_ADD'
  | 'MEMBER_REMOVE'
  | 'ROTATION_CHANGE'
  | 'ADMIN_CHANGE'
  | 'EARLY_EXIT'
  | 'ADMIN_LOAN'
  | 'SOLIDARITY_PAYOUT'
  | 'FINE_WAIVER'
  | 'LEDGER_CORRECTION';

/** R11.2: majority = floor(n / 2) + 1, two-thirds = ceil(2n / 3), of eligible voters. */
export type ThresholdKind = 'MAJORITY' | 'TWO_THIRDS';

export interface ProposalRule {
  proposer: 'ANY_MEMBER' | 'LEAVING_MEMBER' | 'ADMIN_LOAN_REQUEST';
  threshold: ThresholdKind;
  /** R11.5: secret ballots are counters only. */
  secret: boolean;
  /** Who is not an eligible voter on this proposal. */
  excluded: 'NONE' | 'TARGET' | 'REQUESTER' | 'ADMIN' | 'FINED_MEMBER';
  /** ROTATION_CHANGE: every member whose position changes must also vote yes. */
  movedMembersMustApprove: boolean;
  takesEffect: 'NEXT_ROUND' | 'NEXT_ROUND_OR_CYCLE' | 'NEXT_CYCLE' | 'IMMEDIATELY' | 'SETTLEMENT';
  window: 'STANDARD' | 'SOLIDARITY';
}

const rule = (
  r: Partial<ProposalRule> & Pick<ProposalRule, 'threshold' | 'takesEffect'>,
): ProposalRule => ({
  proposer: 'ANY_MEMBER',
  secret: false,
  excluded: 'NONE',
  movedMembersMustApprove: false,
  window: 'STANDARD',
  ...r,
});

/** R11.1: the proposal table. */
export const PROPOSAL_RULES: Readonly<Record<ProposalType, ProposalRule>> = {
  // Next round; rotation mode, frequency and payout time from the next cycle (ruleChangeTakesEffect).
  RULE_CHANGE: rule({ threshold: 'TWO_THIRDS', takesEffect: 'NEXT_ROUND_OR_CYCLE' }),
  // The invite is created at once; the new member is active from the next cycle (R12.1).
  MEMBER_ADD: rule({ threshold: 'MAJORITY', takesEffect: 'NEXT_CYCLE' }),
  MEMBER_REMOVE: rule({
    threshold: 'MAJORITY',
    secret: true,
    excluded: 'TARGET',
    takesEffect: 'SETTLEMENT',
  }),
  ROTATION_CHANGE: rule({
    threshold: 'MAJORITY',
    movedMembersMustApprove: true,
    takesEffect: 'NEXT_ROUND',
  }),
  ADMIN_CHANGE: rule({ threshold: 'MAJORITY', secret: true, takesEffect: 'IMMEDIATELY' }),
  EARLY_EXIT: rule({
    proposer: 'LEAVING_MEMBER',
    threshold: 'MAJORITY',
    excluded: 'REQUESTER',
    takesEffect: 'SETTLEMENT',
  }),
  ADMIN_LOAN: rule({
    proposer: 'ADMIN_LOAN_REQUEST',
    threshold: 'MAJORITY',
    excluded: 'ADMIN',
    takesEffect: 'IMMEDIATELY',
  }),
  SOLIDARITY_PAYOUT: rule({
    threshold: 'MAJORITY',
    takesEffect: 'IMMEDIATELY',
    window: 'SOLIDARITY',
  }),
  FINE_WAIVER: rule({
    threshold: 'MAJORITY',
    excluded: 'FINED_MEMBER',
    takesEffect: 'IMMEDIATELY',
  }),
  LEDGER_CORRECTION: rule({ threshold: 'TWO_THIRDS', takesEffect: 'IMMEDIATELY' }),
};

/**
 * 3.1, R11.1: eligible voters are the active members when the proposal is created, minus the
 * excluded member for that type (removal target, early-exit requester, borrowing admin, fined member).
 */
export function eligibleVoters(input: {
  type: ProposalType;
  activeMembershipIds: readonly string[];
  excludedMembershipId: string | null;
}): string[] {
  const needsExclusion = PROPOSAL_RULES[input.type].excluded !== 'NONE';
  if (needsExclusion && !input.excludedMembershipId) {
    throw new RangeError(`${input.type} needs the member excluded from the vote`);
  }
  const excluded = needsExclusion ? input.excludedMembershipId : null;
  return input.activeMembershipIds.filter((id) => id !== excluded);
}

/** R11.3, R10.3: voteWindowHours, or solidarityVoteWindowHours for a solidarity payout. */
export function proposalWindowHours(
  type: ProposalType,
  params: Pick<RuleSetParams, 'voteWindowHours' | 'solidarityVoteWindowHours'>,
): number {
  return PROPOSAL_RULES[type].window === 'SOLIDARITY'
    ? params.solidarityVoteWindowHours
    : params.voteWindowHours;
}

/**
 * R11.1: any member can propose, except EARLY_EXIT (only the leaving member, for themselves) and
 * ADMIN_LOAN (created by an admin's loan request, never proposed directly).
 */
export function canPropose(input: {
  type: ProposalType;
  proposerMembershipId: string;
  /** EARLY_EXIT: the member who leaves. */
  subjectMembershipId: string | null;
}): { ok: true } | Refusal<'ONLY_THE_LEAVING_MEMBER' | 'CREATED_BY_ADMIN_LOAN_REQUEST'> {
  const proposer = PROPOSAL_RULES[input.type].proposer;
  if (proposer === 'ADMIN_LOAN_REQUEST')
    return { ok: false, code: 'CREATED_BY_ADMIN_LOAN_REQUEST' };
  if (proposer === 'LEAVING_MEMBER' && input.subjectMembershipId !== input.proposerMembershipId) {
    return { ok: false, code: 'ONLY_THE_LEAVING_MEMBER' };
  }
  return { ok: true };
}
