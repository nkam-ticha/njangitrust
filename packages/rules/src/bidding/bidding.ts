// Bidding mode, enchère (R8.2–R8.6).

import { biddingDrawEvent, type BiddingDrawEvent } from '../ledger';
import type { Fcfa } from '../money';
import type { Refusal } from '../result';
import type { RotationMode } from '../ruleset';
import { assertDate } from '../time';

/** A sealed bid. `reachedAt` is when it reached its current amount (placed, or last raised). */
export interface Bid {
  membershipId: string;
  amount: Fcfa;
  reachedAt: Date;
}

/** R8.2: the active members not yet served in this cycle. */
export function biddingEligible(input: {
  activeMembershipIds: readonly string[];
  servedMembershipIds: readonly string[];
}): string[] {
  const served = new Set(input.servedMembershipIds);
  return input.activeMembershipIds.filter((id) => !served.has(id));
}

/**
 * R8.2, R8.3, R8.4: one sealed bid of at least minBid per eligible member, raised (never lowered)
 * until bidding closes at the round's dueAt. No bidding in the last round (one eligible member).
 */
export function validateBid(input: {
  rotationMode: RotationMode;
  membershipId: string;
  eligibleMembershipIds: readonly string[];
  amount: Fcfa;
  minBid: Fcfa;
  currentBid: { amount: Fcfa } | null;
  now: Date;
  /** The round's dueAt. */
  closesAt: Date;
}):
  | { ok: true; action: 'PLACE' | 'RAISE' }
  | Refusal<
      | 'BIDDING_NOT_ENABLED'
      | 'LAST_ROUND_NO_BIDDING'
      | 'NOT_ELIGIBLE_TO_BID'
      | 'BIDDING_CLOSED'
      | 'INVALID_AMOUNT'
    >
  | Refusal<'BID_BELOW_MINIMUM', { minimum: Fcfa }>
  | Refusal<'BID_NOT_A_RAISE', { current: Fcfa }> {
  if (input.rotationMode !== 'BIDDING') return { ok: false, code: 'BIDDING_NOT_ENABLED' };
  if (input.eligibleMembershipIds.length <= 1) return { ok: false, code: 'LAST_ROUND_NO_BIDDING' };
  if (!input.eligibleMembershipIds.includes(input.membershipId))
    return { ok: false, code: 'NOT_ELIGIBLE_TO_BID' };
  if (assertDate(input.now, 'now') >= assertDate(input.closesAt, 'closesAt')) {
    return { ok: false, code: 'BIDDING_CLOSED' };
  }
  if (!Number.isSafeInteger(input.amount) || input.amount < 0)
    return { ok: false, code: 'INVALID_AMOUNT' };
  if (input.amount < input.minBid)
    return { ok: false, code: 'BID_BELOW_MINIMUM', minimum: input.minBid };
  if (input.currentBid) {
    if (input.amount <= input.currentBid.amount) {
      return { ok: false, code: 'BID_NOT_A_RAISE', current: input.currentBid.amount };
    }
    return { ok: true, action: 'RAISE' };
  }
  return { ok: true, action: 'PLACE' };
}

/** R8.6: bids in published order: highest first, then whoever reached the amount first. */
function rank(bids: readonly Bid[]): Bid[] {
  return [...bids].sort((a, b) => {
    if (a.amount !== b.amount) return b.amount - a.amount;
    const byTime = a.reachedAt.getTime() - b.reachedAt.getTime();
    if (byTime !== 0) return byTime;
    return a.membershipId < b.membershipId ? -1 : a.membershipId > b.membershipId ? 1 : 0;
  });
}

/** R8.3: the highest bid wins; between equal bids, the one that reached that amount first. */
export function bidWinner(bids: readonly Bid[]): Bid | null {
  return rank(bids)[0] ?? null;
}

export type BiddingOutcome =
  | { outcome: 'ONLY_ELIGIBLE'; beneficiaryMembershipId: string }
  | {
      outcome: 'WINNING_BID';
      beneficiaryMembershipId: string;
      amount: Fcfa;
      publishedBids: { membershipId: string; amount: Fcfa }[];
    }
  | { outcome: 'DRAW'; beneficiaryMembershipId: string; event: BiddingDrawEvent };

/**
 * R8.3–R8.6: closes a round's bidding at dueAt. The last eligible member is the beneficiary without
 * bidding (R8.4); otherwise the winning bid (assess it with BID_ASSESSED when above 0, R8.5) or, with
 * no bids, the verifiable draw to record as an EVENT. All bids are published after the close.
 */
export function closeBidding(input: {
  groupId: string;
  cycleNumber: number;
  roundNumber: number;
  roundId: string;
  latestLedgerHash: string;
  eligibleMembershipIds: readonly string[];
  bids: readonly Bid[];
}): BiddingOutcome {
  if (input.eligibleMembershipIds.length === 0)
    throw new RangeError('nobody is eligible for this round');
  if (input.eligibleMembershipIds.length === 1) {
    return { outcome: 'ONLY_ELIGIBLE', beneficiaryMembershipId: input.eligibleMembershipIds[0]! };
  }
  const eligible = new Set(input.eligibleMembershipIds);
  const ranked = rank(input.bids.filter((b) => eligible.has(b.membershipId)));
  const winner = ranked[0];
  if (winner) {
    return {
      outcome: 'WINNING_BID',
      beneficiaryMembershipId: winner.membershipId,
      amount: winner.amount,
      publishedBids: ranked.map((b) => ({ membershipId: b.membershipId, amount: b.amount })),
    };
  }
  const event = biddingDrawEvent({
    groupId: input.groupId,
    cycleNumber: input.cycleNumber,
    roundNumber: input.roundNumber,
    roundId: input.roundId,
    latestLedgerHash: input.latestLedgerHash,
    eligibleMembershipIds: input.eligibleMembershipIds,
  });
  return { outcome: 'DRAW', beneficiaryMembershipId: event.beneficiaryMembershipId, event };
}
