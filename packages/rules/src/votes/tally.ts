// Vote thresholds, tallies and early close (R11.2–R11.5).

import type { Refusal } from '../result';
import { assertDate } from '../time';
import type { ThresholdKind } from './proposals';

export type ProposalStatus = 'OPEN' | 'PASSED' | 'REJECTED' | 'EXPIRED';

/** R11.2: votes needed, counted against eligible voters: majority floor(n/2) + 1, two-thirds ceil(2n/3). */
export function thresholdCount(kind: ThresholdKind, eligibleCount: number): number {
  if (!Number.isSafeInteger(eligibleCount) || eligibleCount < 0)
    throw new RangeError('invalid voter count');
  if (kind === 'MAJORITY') return (eligibleCount - (eligibleCount % 2)) / 2 + 1;
  const twice = 2 * eligibleCount;
  return (twice + ((3 - (twice % 3)) % 3)) / 3;
}

/**
 * R11.2, R11.3: the state of a proposal. PASSED as soon as the threshold is reached (and, for a
 * ROTATION_CHANGE, every moved member voted yes); REJECTED as soon as that can no longer happen;
 * EXPIRED when the window ends first; otherwise OPEN.
 *
 * D26 (refines D20.1): a secret proposal does not close early on a certain result, because live
 * participation plus an early close could reveal choices. It closes before `closesAt` only when
 * every eligible member has voted: nobody is left who could change the outcome, and the final tally
 * then reveals nothing that the closing would not.
 */
export function tallyProposal(input: {
  thresholdKind: ThresholdKind;
  eligibleCount: number;
  yes: number;
  no: number;
  /** ROTATION_CHANGE: the members whose position changes and how they voted. */
  mustApprove?: { required: number; yes: number; no: number };
  /** R11.5: a secret proposal (MEMBER_REMOVE, ADMIN_CHANGE). Default false. */
  secret?: boolean;
  closesAt: Date;
  now: Date;
}): { status: ProposalStatus; required: number; remaining: number } {
  const required = thresholdCount(input.thresholdKind, input.eligibleCount);
  const counts = [input.yes, input.no];
  if (
    counts.some((c) => !Number.isSafeInteger(c) || c < 0) ||
    input.yes + input.no > input.eligibleCount
  ) {
    throw new RangeError('more votes than eligible voters');
  }
  const remaining = input.eligibleCount - input.yes - input.no;
  const approvals = input.mustApprove;
  const timeIsUp = assertDate(input.now, 'now') >= assertDate(input.closesAt, 'closesAt');
  if (input.secret && remaining > 0 && !timeIsUp) return { status: 'OPEN', required, remaining };
  const approved = !approvals || approvals.yes >= approvals.required;
  if (input.yes >= required && approved) return { status: 'PASSED', required, remaining };
  if (input.yes + remaining < required || (approvals && approvals.no > 0)) {
    return { status: 'REJECTED', required, remaining };
  }
  if (timeIsUp) return { status: 'EXPIRED', required, remaining };
  return { status: 'OPEN', required, remaining };
}

/**
 * When a proposal that is being closed counts as closed. A secret proposal seen after its deadline
 * is closed as of `closesAt` (D20.1: the result's time cannot point to the job that ran it); every
 * other close, including a secret vote that every eligible member has finished (D26), is now.
 */
export function closeInstant(input: { secret: boolean; closesAt: Date; now: Date }): Date {
  return input.secret && input.now >= input.closesAt ? input.closesAt : input.now;
}

/** R11.4: one vote per eligible member, never changed, only while the proposal is open. */
export function validateVote(input: {
  eligibleVoterIds: readonly string[];
  voterId: string;
  alreadyVoted: boolean;
  status: ProposalStatus;
  closesAt: Date;
  now: Date;
}): { ok: true } | Refusal<'NOT_ELIGIBLE_VOTER' | 'ALREADY_VOTED' | 'PROPOSAL_CLOSED'> {
  if (
    input.status !== 'OPEN' ||
    assertDate(input.now, 'now') >= assertDate(input.closesAt, 'closesAt')
  ) {
    return { ok: false, code: 'PROPOSAL_CLOSED' };
  }
  if (!input.eligibleVoterIds.includes(input.voterId))
    return { ok: false, code: 'NOT_ELIGIBLE_VOTER' };
  if (input.alreadyVoted) return { ok: false, code: 'ALREADY_VOTED' };
  return { ok: true };
}

/**
 * R11.5: what members see. While a secret vote is open, only participation ("6 membres ont voté");
 * yes and no totals once it closes. Non-secret votes show totals all along.
 */
export function visibleTally(input: {
  secret: boolean;
  status: ProposalStatus;
  yes: number;
  no: number;
}): { voted: number; yes?: number; no?: number } {
  const voted = input.yes + input.no;
  if (input.secret && input.status === 'OPEN') return { voted };
  return { voted, yes: input.yes, no: input.no };
}
