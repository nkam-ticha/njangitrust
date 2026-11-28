// EVENT entries (2.5): governance facts recorded in the hash chain with no postings. The draw
// events carry everything needed to re-run the draw (R2.3, R8.3).

import type { RotationMode } from '../ruleset';
import {
  biddingDrawSeed,
  drawRotation,
  drawSeed,
  redrawSeed,
  remainingRotationDraw,
  verifiableShuffle,
} from '../rotation';

/** R2.3: a cycle started; FIXED cycles carry the draw seed and the drawn order. */
export type CycleStartedEvent = {
  event: 'CYCLE_STARTED';
  cycleNumber: number;
  mode: RotationMode;
  latestHash: string;
  drawSeed: string | null;
  /**
   * D40.3: 'CARRIED' when a cycle after the first keeps the previous order (no draw, no seed).
   * Absent or 'DRAW' for every earlier entry: those stay valid and are checked as draws.
   */
  orderSource?: 'DRAW' | 'CARRIED';
  /** L7: for a kept order, when each newcomer (last in the order) joined: ISO instants, by membership. */
  newcomerJoinedAt?: Record<string, string>;
  order: string[];
  /** M3: the cycle's active members, sorted (both modes). */
  members: string[];
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

/** D13.1: a cycle switched from BIDDING to FIXED; the remaining order was drawn. */
export type RotationRedrawnEvent = {
  event: 'ROTATION_REDRAWN';
  cycleNumber: number;
  fromRound: number;
  latestHash: string;
  drawSeed: string;
  /** M3: the members not yet served (the draw's input) and those already served, sorted. */
  eligibleMembershipIds: string[];
  servedMembershipIds: string[];
  order: string[];
};

/** 2.5 EVENT kinds besides the draws: R11.8 vote results, R12 membership, R13.4, R15.4. */
export type GovernanceEvent =
  | { event: 'RULE_SET_APPLIED'; version: number; proposalId: string | null }
  | {
      event: 'VOTE_CLOSED';
      proposalId: string;
      proposalType: string;
      status: string;
      /** Left out when a secret vote ends without a result (a developer closed the group). */
      yes?: number;
      no?: number;
      eligible: number;
    }
  | {
      /** D40.1, R9.3: a cycle closed; what the general fund held and what was shared (integers only). */
      event: 'CYCLE_CLOSED';
      cycleNumber: number;
      mode: RotationMode;
      fundBalance: number;
      receivables: number;
      availableForLoans: number;
      distributable: number;
      share: number;
      distributed: number;
      remainder: number;
      eligibleCount: number;
      reason: 'DISTRIBUTION_OFF' | 'NOTHING_TO_DISTRIBUTE' | 'NO_ELIGIBLE_MEMBER' | null;
    }
  | { event: 'ROTATION_CHANGED'; cycleNumber: number; order: string[]; proposalId: string }
  | {
      event: 'BIDS_PUBLISHED';
      cycleNumber: number;
      roundNumber: number;
      roundId: string;
      /** M3: the winner, so a later redraw can be cross-checked. */
      beneficiaryMembershipId: string;
      bids: { membershipId: string; amount: number }[];
    }
  | { event: 'MEMBER_JOINED'; membershipId: string }
  | { event: 'MEMBER_LEFT'; membershipId: string; reason: 'CYCLE_END' | 'EARLY_EXIT' | 'REMOVED' }
  | { event: 'PAYMENT_NUMBER_CHANGED'; membershipId: string }
  | { event: 'MINUTES_PUBLISHED'; meetingId: string; version: number; minutesHash: string };

export type DrawEvent = CycleStartedEvent | BiddingDrawEvent | RotationRedrawnEvent;
export type LedgerEvent = DrawEvent | GovernanceEvent;

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
    members: [...input.activeMembershipIds].sort(),
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

/**
 * D40.3: the CYCLE_STARTED event of a cycle that keeps the previous order. No seed: the order is the
 * previous final order with leavers dropped and newcomers last (carryRotation), checked against the
 * previous cycle by the export verifier. A bidding cycle has no order, so it uses cycleStartedEvent.
 */
export function carriedCycleStartedEvent(input: {
  cycleNumber: number;
  latestLedgerHash: string;
  activeMembershipIds: readonly string[];
  order: readonly string[];
  newcomerJoinedAt?: Record<string, string>;
}): CycleStartedEvent {
  const members = [...input.activeMembershipIds].sort();
  const sorted = [...input.order].sort();
  if (members.length !== sorted.length || members.some((id, i) => id !== sorted[i])) {
    throw new RangeError('the kept order must be exactly the cycle members');
  }
  return {
    event: 'CYCLE_STARTED',
    cycleNumber: input.cycleNumber,
    mode: 'FIXED',
    latestHash: input.latestLedgerHash,
    drawSeed: null,
    orderSource: 'CARRIED',
    ...(input.newcomerJoinedAt && Object.keys(input.newcomerJoinedAt).length > 0
      ? { newcomerJoinedAt: { ...input.newcomerJoinedAt } }
      : {}),
    order: [...input.order],
    members,
  };
}

/** D40.1: the CYCLE_CLOSED event, from the figures of planCycleClose. */
export function cycleClosedEvent(input: {
  cycleNumber: number;
  mode: RotationMode;
  facts: {
    fundBalance: number;
    receivables: number;
    availableForLoans: number;
    distributable: number;
    share: number;
    distributed: number;
    remainder: number;
    eligibleCount: number;
    reason: 'DISTRIBUTION_OFF' | 'NOTHING_TO_DISTRIBUTE' | 'NO_ELIGIBLE_MEMBER' | null;
  };
}): Extract<GovernanceEvent, { event: 'CYCLE_CLOSED' }> {
  return {
    event: 'CYCLE_CLOSED',
    cycleNumber: input.cycleNumber,
    mode: input.mode,
    ...input.facts,
  };
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

/** D13.1: the ROTATION_REDRAWN event, running the draw of the remaining order. */
export function rotationRedrawnEvent(input: {
  groupId: string;
  cycleNumber: number;
  fromRound: number;
  latestLedgerHash: string;
  notYetServedMembershipIds: readonly string[];
  servedMembershipIds: readonly string[];
}): RotationRedrawnEvent {
  const { seed, order } = remainingRotationDraw(input);
  return {
    event: 'ROTATION_REDRAWN',
    cycleNumber: input.cycleNumber,
    fromRound: input.fromRound,
    latestHash: input.latestLedgerHash,
    drawSeed: seed,
    eligibleMembershipIds: [...input.notYetServedMembershipIds].sort(),
    servedMembershipIds: [...input.servedMembershipIds].sort(),
    order,
  };
}

/**
 * R2.3, R8.3, D13.1: re-runs a recorded draw. `latestHashAtDraw` is the hash of the transaction before the
 * EVENT (or the genesis hash). Returns null when the draw is correct, else what is wrong.
 */
export function drawEventProblem(
  groupId: string,
  event: DrawEvent,
  latestHashAtDraw: string,
): string | null {
  if (event.latestHash !== latestHashAtDraw)
    return 'the latest hash is not the hash before the draw';
  if (event.event === 'CYCLE_STARTED') {
    if (event.orderSource === 'CARRIED') {
      // D40.3: no draw to re-run. What can be checked here is the shape; the positions against the
      // previous cycle are checked by the export verifier (drawProblems).
      if (event.mode !== 'FIXED') return 'a kept order is only for a fixed cycle';
      if (event.drawSeed !== null) return 'a kept order has no seed, the seed must be empty';
      const members = [...event.members].sort();
      const order = [...event.order].sort();
      return members.length === order.length && members.every((id, i) => id === order[i])
        ? null
        : "the kept order must be exactly the cycle's members";
    }
    if (event.mode === 'BIDDING')
      return event.drawSeed === null ? null : 'a bidding cycle has no draw';
    if (event.drawSeed !== drawSeed(groupId, event.cycleNumber, event.latestHash))
      return 'the seed is wrong';
    const redrawn = verifiableShuffle(event.order, event.drawSeed);
    return redrawn.every((id, i) => id === event.order[i])
      ? null
      : 'the order does not follow the draw';
  }
  if (event.event === 'ROTATION_REDRAWN') {
    const seed = redrawSeed(groupId, event.cycleNumber, event.fromRound, event.latestHash);
    if (event.drawSeed !== seed) return 'the seed is wrong';
    const served = new Set(event.servedMembershipIds);
    if (event.eligibleMembershipIds.some((id) => served.has(id))) {
      return 'a served member is in the redraw';
    }
    const redrawn = verifiableShuffle(event.eligibleMembershipIds, seed);
    return redrawn.length === event.order.length && redrawn.every((id, i) => id === event.order[i])
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
