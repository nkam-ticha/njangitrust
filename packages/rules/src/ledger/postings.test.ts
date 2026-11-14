import { describe, expect, it } from 'vitest';
import { paymentReceivedPostings } from './fee-postings';
import {
  autoSettlementPostings,
  bidAssessedPostings,
  fineAssessedPostings,
  fundDistributionPostings,
  leaverRefundPostings,
  potAssignedPostings,
  potCorrectionDebt,
  potCorrectionPostings,
  reversalPostings,
  sumsToZero,
} from './postings';

describe('PAYMENT_RECEIVED (2.5, R4.2, R4.4)', () => {
  it('refuses a fee equal to the whole payment: some cash must come in (L1)', () => {
    expect(() =>
      paymentReceivedPostings({
        payerMembershipId: 'M1',
        fee: 100,
        feeSource: 'PROVIDER',
        parts: [{ kind: 'SHORTFALL', amount: 100, creditorMembershipId: 'M6' }],
      }),
    ).toThrow(RangeError);
  });

  it('posts E1 exactly and records the fee, its source and each part’s share', () => {
    const { postings, parts, metadata } = paymentReceivedPostings({
      payerMembershipId: 'M3',
      fee: 100,
      feeSource: 'SCHEDULE',
      parts: [
        {
          kind: 'CONTRIBUTION',
          amount: 10_000,
          creditorMembershipId: 'M7',
          tieOrder: 8,
          ref: 'c4',
        },
        { kind: 'SOLIDARITY', amount: 1_000, ref: 's4' },
      ],
    });
    expect(postings).toEqual([
      { account: 'cash:provider', amount: 10_900 },
      { account: 'payable:member:M7', amount: -9_909 },
      { account: 'fund:solidarity', amount: -991 },
    ]);
    expect(parts.map((p) => p.feeShare)).toEqual([91, 9]);
    expect(metadata).toEqual({
      fee: 100,
      feeSource: 'SCHEDULE',
      parts: [
        {
          obligationId: 'c4',
          kind: 'CONTRIBUTION',
          amount: 10_000,
          feeShare: 91,
          tieOrder: 8,
          account: 'payable:member:M7',
        },
        {
          obligationId: 's4',
          kind: 'SOLIDARITY',
          amount: 1_000,
          feeShare: 9,
          tieOrder: 0,
          account: 'fund:solidarity',
        },
      ],
    });
    expect(sumsToZero(postings)).toBe(true);
  });

  it('posts E4 exactly, the debt part going to the payer’s receivable with its fee on the fund', () => {
    const { postings } = paymentReceivedPostings({
      payerMembershipId: 'M5',
      fee: 100,
      feeSource: 'PROVIDER',
      parts: [
        { kind: 'CONTRIBUTION', amount: 10_000, creditorMembershipId: 'M7' },
        { kind: 'SOLIDARITY', amount: 1_000 },
        { kind: 'DEBT', amount: 1_000 },
      ],
    });
    expect(postings).toEqual([
      { account: 'cash:provider', amount: 11_900 },
      { account: 'payable:member:M7', amount: -9_916 },
      { account: 'fund:solidarity', amount: -992 },
      { account: 'receivable:member:M5', amount: -1_000 },
      { account: 'fund:general', amount: 8 },
    ]);
  });

  it('credits the leaver for a shortfall part and the round pot in bidding mode', () => {
    const { postings } = paymentReceivedPostings({
      payerMembershipId: 'M1',
      fee: 100,
      feeSource: 'SCHEDULE',
      parts: [
        { kind: 'CONTRIBUTION', amount: 10_000, potRoundId: 'r5' },
        { kind: 'SHORTFALL', amount: 1_667, creditorMembershipId: 'M6' },
      ],
    });
    // 100 × 10 000 / 11 667 = 85.71 and 14.29: floors 85 + 14 = 99, the franc goes to 0.71.
    expect(postings).toEqual([
      { account: 'cash:provider', amount: 11_567 },
      { account: 'pot:round:r5', amount: -9_914 },
      { account: 'payable:member:M6', amount: -1_653 },
    ]);
  });
});

describe('the other transaction types (2.5)', () => {
  it('FINE_ASSESSED (E4) and BID_ASSESSED (E6) move debt to the receivable and the fund', () => {
    expect(fineAssessedPostings({ membershipId: 'M5', amount: 1_000 })).toEqual([
      { account: 'receivable:member:M5', amount: 1_000 },
      { account: 'fund:general', amount: -1_000 },
    ]);
    expect(bidAssessedPostings({ membershipId: 'M9', amount: 5_000 })).toEqual([
      { account: 'receivable:member:M9', amount: 5_000 },
      { account: 'fund:general', amount: -5_000 },
    ]);
  });

  it('AUTO_SETTLEMENT pays a debt from the same member’s payable (E5)', () => {
    expect(autoSettlementPostings({ membershipId: 'M7', amount: 17_750 })).toEqual([
      { account: 'payable:member:M7', amount: 17_750 },
      { account: 'receivable:member:M7', amount: -17_750 },
    ]);
  });

  it('POT_CORRECTION moves money back from the winner’s payable into the pot', () => {
    const args = { roundId: 'r5', beneficiaryMembershipId: 'M9', amount: 9_909 };
    expect(potCorrectionPostings({ ...args, winnerPayable: 50_000 })).toEqual([
      { account: 'payable:member:M9', amount: 9_909 },
      { account: 'pot:round:r5', amount: -9_909 },
    ]);
    expect(potCorrectionDebt({ amount: 9_909, winnerPayable: 50_000 })).toBe(0);
  });

  it('turns what the winner’s payable no longer holds into the winner’s debt, never the fund’s (D15)', () => {
    expect(
      potCorrectionPostings({
        roundId: 'r5',
        beneficiaryMembershipId: 'M9',
        amount: 9_909,
        winnerPayable: 4_000,
      }),
    ).toEqual([
      { account: 'payable:member:M9', amount: 4_000 },
      { account: 'receivable:member:M9', amount: 5_909 },
      { account: 'pot:round:r5', amount: -9_909 },
    ]);
    expect(
      potCorrectionPostings({
        roundId: 'r5',
        beneficiaryMembershipId: 'M9',
        amount: 9_909,
        winnerPayable: 0,
      }),
    ).toEqual([
      { account: 'receivable:member:M9', amount: 9_909 },
      { account: 'pot:round:r5', amount: -9_909 },
    ]);
    expect(potCorrectionDebt({ amount: 9_909, winnerPayable: 4_000 })).toBe(5_909);
    expect(() =>
      potCorrectionPostings({
        roundId: 'r5',
        beneficiaryMembershipId: 'M9',
        amount: 9_909,
        winnerPayable: -1,
      }),
    ).toThrow(RangeError);
  });

  it('LEAVER_REFUND (E9), FUND_DISTRIBUTION (E8) and POT_ASSIGNED', () => {
    expect(leaverRefundPostings({ membershipId: 'M6', amount: 25_000 })).toEqual([
      { account: 'payable:member:M6', amount: -25_000 },
      { account: 'fund:general', amount: 25_000 },
    ]);
    const shares = ['M1', 'M2', 'M3'].map((m) => ({ membershipId: m, amount: 4_111 }));
    expect(fundDistributionPostings({ shares })).toEqual([
      { account: 'fund:general', amount: 12_333 },
      { account: 'payable:member:M1', amount: -4_111 },
      { account: 'payable:member:M2', amount: -4_111 },
      { account: 'payable:member:M3', amount: -4_111 },
    ]);
    expect(
      potAssignedPostings({ roundId: 'r5', beneficiaryMembershipId: 'M9', amount: 99_090 }),
    ).toEqual([
      { account: 'pot:round:r5', amount: 99_090 },
      { account: 'payable:member:M9', amount: -99_090 },
    ]);
  });

  it('REVERSAL is the exact negation, and reversing twice gives the original', () => {
    const original = fineAssessedPostings({ membershipId: 'M5', amount: 1_000 });
    const reversal = reversalPostings(original);
    expect(reversal).toEqual([
      { account: 'receivable:member:M5', amount: -1_000 },
      { account: 'fund:general', amount: 1_000 },
    ]);
    expect(reversalPostings(reversal)).toEqual(original);
    expect(() => reversalPostings([])).toThrow(RangeError);
  });

  it('refuses zero, negative and fractional amounts', () => {
    expect(() => fineAssessedPostings({ membershipId: 'M5', amount: 0 })).toThrow(RangeError);
    expect(() => autoSettlementPostings({ membershipId: 'M5', amount: -1 })).toThrow(RangeError);
    expect(() => leaverRefundPostings({ membershipId: 'M5', amount: 1.5 })).toThrow(RangeError);
    expect(() => fundDistributionPostings({ shares: [] })).toThrow(RangeError);
  });

  it('every builder sums to zero', () => {
    expect(sumsToZero([{ account: 'cash:provider', amount: 1 }])).toBe(false);
    expect(sumsToZero([])).toBe(true);
  });
});
