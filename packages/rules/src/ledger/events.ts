// EVENT entries (2.5): governance facts recorded in the hash chain with no postings. The draw
// events carry everything needed to re-run the draw (R2.3, R8.3).

import type { RotationMode } from '../ruleset';
import { biddingDrawSeed, drawRotation, drawSeed, verifiableShuffle } from '../rotation';

/** R2.3: a cycle started; FIXED cycles carry the draw seed and the drawn order. */
export type CycleStartedEvent = {
  event: 'CYCLE_STARTED';
  cycleNumber: number;
  mode: RotationMode;
  latestHash: string;
  drawSeed: string | null;
  order: string[];
};

/** R8.3: a bidding round closed with no bids; the beneficiary was drawn. */
export type BiddingDrawEvent = {
  event: 'BIDDING_DRAW';
  cycleNumber: number;
  roundNumber: number;
  roundId: string;
  latestHash: string;
  drawSeed: string;
  eligibleMembershipIds: string[];
  beneficiaryMembershipId: string;
};

/** 2.5 EVENT kinds besides the draws: R11.8 vote results, R12 membership, R13.4, R15.4. */
export type GovernanceEvent =
  | { event: 'RULE_SET_APPLIED'; version: number; proposalId: string | null }
  | {
      event: 'VOTE_CLOSED';
      proposalId: string;
      proposalType: string;
      status: string;
      yes: number;
      no: number;
      eligible: number;
    }
  | { event: 'ROTATION_CHANGED'; cycleNumber: number; order: string[]; proposalId: string }
  | { event: 'BIDS_PUBLISHED'; roundId: string; bids: { membershipId: string; amount: number }[] }
  | { event: 'MEMBER_JOINED'; membershipId: string }
  | { event: 'MEMBER_LEFT'; membershipId: string; reason: 'CYCLE_END' | 'EARLY_EXIT' | 'REMOVED' }
  | { event: 'PAYMENT_NUMBER_CHANGED'; membershipId: string }
  | { event: 'MINUTES_PUBLISHED'; meetingId: string; version: number; minutesHash: string };

export type LedgerEvent = CycleStartedEvent | BiddingDrawEvent | GovernanceEvent;

/** R2.3: the CYCLE_STARTED event, running the verifiable draw for a FIXED cycle. */
export function cycleStartedEvent(input: {
  groupId: string;
  cycleNumber: number;
  mode: RotationMode;
  latestLedgerHash: string;
  activeMembershipIds: readonly string[];
}): CycleStartedEvent {
  const base = {
    event: 'CYCLE_STARTED',
    cycleNumber: input.cycleNumber,
    mode: input.mode,
    latestHash: input.latestLedgerHash,
  } as const;
  if (input.mode === 'BIDDING') return { ...base, drawSeed: null, order: [] };
  const { seed, order } = drawRotation({
    groupId: input.groupId,
    cycleNumber: input.cycleNumber,
    latestLedgerHash: input.latestLedgerHash,
    activeMembershipIds: input.activeMembershipIds,
  });
  return { ...base, drawSeed: seed, order };
}

/** R8.3: the no-bid draw; the beneficiary is the first member of the verifiable shuffle. */
export function biddingDrawEvent(input: {
  groupId: string;
  cycleNumber: number;
  roundNumber: number;
  roundId: string;
  latestLedgerHash: string;
  eligibleMembershipIds: readonly string[];
}): BiddingDrawEvent {
  if (input.eligibleMembershipIds.length === 0) throw new RangeError('nobody is eligible');
  const seed = biddingDrawSeed(
    input.groupId,
    input.cycleNumber,
    input.roundNumber,
    input.latestLedgerHash,
  );
  return {
    event: 'BIDDING_DRAW',
    cycleNumber: input.cycleNumber,
    roundNumber: input.roundNumber,
    roundId: input.roundId,
    latestHash: input.latestLedgerHash,
    drawSeed: seed,
    eligibleMembershipIds: [...input.eligibleMembershipIds].sort(),
    beneficiaryMembershipId: verifiableShuffle(input.eligibleMembershipIds, seed)[0]!,
  };
}

/**
 * R2.3, R8.3: re-runs a recorded draw. `latestHashAtDraw` is the hash of the transaction before the
 * EVENT (or the genesis hash). Returns null when the draw is correct, else what is wrong.
 */
export function drawEventProblem(
  groupId: string,
  event: CycleStartedEvent | BiddingDrawEvent,
  latestHashAtDraw: string,
): string | null {
  if (event.latestHash !== latestHashAtDraw)
    return 'the latest hash is not the hash before the draw';
  if (event.event === 'CYCLE_STARTED') {
    if (event.mode === 'BIDDING')
      return event.drawSeed === null ? null : 'a bidding cycle has no draw';
    if (event.drawSeed !== drawSeed(groupId, event.cycleNumber, event.latestHash))
      return 'the seed is wrong';
    const redrawn = verifiableShuffle(event.order, event.drawSeed);
    return redrawn.every((id, i) => id === event.order[i])
      ? null
      : 'the order does not follow the draw';
  }
  const seed = biddingDrawSeed(groupId, event.cycleNumber, event.roundNumber, event.latestHash);
  if (event.drawSeed !== seed) return 'the seed is wrong';
  const first = verifiableShuffle(event.eligibleMembershipIds, seed)[0];
  return first === event.beneficiaryMembershipId
    ? null
    : 'the beneficiary does not follow the draw';
}
