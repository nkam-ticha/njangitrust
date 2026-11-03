import { describe, expect, it } from 'vitest';
import { genesisHash } from '../ledger';
import { bidWinner, biddingEligible, closeBidding, validateBid, type Bid } from './bidding';

const GROUP = '9b2e0c4e-1111-4a5b-8c9d-000000000001';
const at = (hhmm: string) => new Date(`2026-12-24T${hhmm}:00.000Z`);
const closesAt = at('17:00');

// E6: round 5, eligible M1, M4, M9.
const e6Bids: Bid[] = [
  { membershipId: 'M1', amount: 3_000, reachedAt: at('10:00') },
  { membershipId: 'M4', amount: 5_000, reachedAt: at('11:00') },
  { membershipId: 'M9', amount: 5_000, reachedAt: at('09:30') },
];

describe('bidding eligibility and bids (R8.2)', () => {
  it('lets active members not yet served this cycle bid', () => {
    expect(
      biddingEligible({
        activeMembershipIds: ['M1', 'M2', 'M4', 'M9'],
        servedMembershipIds: ['M2'],
      }),
    ).toEqual(['M1', 'M4', 'M9']);
  });

  const bid = {
    rotationMode: 'BIDDING' as const,
    membershipId: 'M4',
    eligibleMembershipIds: ['M1', 'M4', 'M9'],
    minBid: 500,
    currentBid: null,
    now: at('11:00'),
    closesAt,
  };

  it('accepts one sealed bid of at least minBid, then raises', () => {
    expect(validateBid({ ...bid, amount: 500 })).toEqual({ ok: true, action: 'PLACE' });
    expect(validateBid({ ...bid, amount: 6_000, currentBid: { amount: 5_000 } })).toEqual({
      ok: true,
      action: 'RAISE',
    });
  });

  it('refuses low bids, lowering or repeating a bid, ineligible members and late bids', () => {
    expect(validateBid({ ...bid, amount: 499 })).toEqual({
      ok: false,
      code: 'BID_BELOW_MINIMUM',
      minimum: 500,
    });
    expect(validateBid({ ...bid, amount: 5_000, currentBid: { amount: 5_000 } })).toEqual({
      ok: false,
      code: 'BID_NOT_A_RAISE',
      current: 5_000,
    });
    expect(validateBid({ ...bid, membershipId: 'M2', amount: 5_000 })).toEqual({
      ok: false,
      code: 'NOT_ELIGIBLE_TO_BID',
    });
    expect(validateBid({ ...bid, amount: 5_000, now: closesAt })).toEqual({
      ok: false,
      code: 'BIDDING_CLOSED',
    });
    expect(validateBid({ ...bid, amount: 5.5 })).toEqual({ ok: false, code: 'INVALID_AMOUNT' });
    expect(validateBid({ ...bid, rotationMode: 'FIXED', amount: 5_000 })).toEqual({
      ok: false,
      code: 'BIDDING_NOT_ENABLED',
    });
    expect(validateBid({ ...bid, eligibleMembershipIds: ['M4'], amount: 5_000 })).toEqual({
      ok: false,
      code: 'LAST_ROUND_NO_BIDDING',
    });
  });
});

describe('closing the bids (R8.3, R8.4, R8.6)', () => {
  const close = {
    groupId: GROUP,
    cycleNumber: 1,
    roundNumber: 5,
    roundId: 'r5',
    latestLedgerHash: genesisHash(GROUP),
  };

  it('E6: M4 and M9 tie at 5 000; M9 reached it first and wins', () => {
    expect(bidWinner(e6Bids)).toEqual(e6Bids[2]);
    expect(
      closeBidding({ ...close, eligibleMembershipIds: ['M1', 'M4', 'M9'], bids: e6Bids }),
    ).toEqual({
      outcome: 'WINNING_BID',
      beneficiaryMembershipId: 'M9',
      amount: 5_000,
      publishedBids: [
        { membershipId: 'M9', amount: 5_000 },
        { membershipId: 'M4', amount: 5_000 },
        { membershipId: 'M1', amount: 3_000 },
      ],
    });
  });

  it('draws the beneficiary verifiably when nobody bid', () => {
    const result = closeBidding({ ...close, eligibleMembershipIds: ['M9', 'M4', 'M1'], bids: [] });
    expect(result).toMatchObject({
      outcome: 'DRAW',
      beneficiaryMembershipId: 'M1',
      event: {
        event: 'BIDDING_DRAW',
        drawSeed: '03df01557a30afdf87293f6443420f629add058bcd8d107e30d461effd854d36',
      },
    });
  });

  it('makes the only eligible member of the last round the beneficiary without bidding', () => {
    expect(closeBidding({ ...close, eligibleMembershipIds: ['M4'], bids: [] })).toEqual({
      outcome: 'ONLY_ELIGIBLE',
      beneficiaryMembershipId: 'M4',
    });
  });

  it('ignores bids from members who are not eligible', () => {
    const stray: Bid = { membershipId: 'M2', amount: 9_000, reachedAt: at('08:00') };
    expect(
      closeBidding({
        ...close,
        eligibleMembershipIds: ['M1', 'M4', 'M9'],
        bids: [...e6Bids, stray],
      }),
    ).toMatchObject({
      beneficiaryMembershipId: 'M9',
    });
  });
});
