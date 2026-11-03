import { describe, expect, it } from 'vitest';
import {
  autoSettlementPostings,
  bidAssessedPostings,
  fineAssessedPostings,
  fundDistributionPostings,
  leaverRefundPostings,
  loanDisbursedPostings,
  paymentReceivedPostings,
  potAssignedPostings,
  reversalPostings,
  solidarityDisbursedPostings,
  sumsToZero,
  withdrawalCompletedPostings,
} from './postings';

describe('PAYMENT_RECEIVED (2.5, R4.2)', () => {
  it('posts E1 exactly: cash +10 900, payable M7 −9 909, solidarity −991', () => {
    const { postings, parts } = paymentReceivedPostings({
      payerMembershipId: 'M3',
      fee: 100,
      parts: [
        { kind: 'CONTRIBUTION', amount: 10_000, creditorMembershipId: 'M7' },
        { kind: 'SOLIDARITY', amount: 1_000 },
      ],
    });
    expect(postings).toEqual([
      { account: 'cash:provider', amount: 10_900 },
      { account: 'payable:member:M7', amount: -9_909 },
      { account: 'fund:solidarity', amount: -991 },
    ]);
    expect(parts.map((p) => p.feeShare)).toEqual([91, 9]);
    expect(sumsToZero(postings)).toBe(true);
  });

  it('posts E4 exactly, the debt part going to the payer’s receivable with its fee on the fund', () => {
    const { postings } = paymentReceivedPostings({
      payerMembershipId: 'M5',
      fee: 100,
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
    expect(sumsToZero(postings)).toBe(true);
  });

  it('credits the leaver for a shortfall part and the round pot in bidding mode', () => {
    const { postings } = paymentReceivedPostings({
      payerMembershipId: 'M1',
      fee: 100,
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

  it('WITHDRAWAL_COMPLETED empties E5’s payable and omits a zero fee difference', () => {
    expect(
      withdrawalCompletedPostings({
        membershipId: 'M7',
        amount: 80_840,
        feeEstimated: 500,
        feeActual: 500,
      }),
    ).toEqual([
      { account: 'payable:member:M7', amount: 81_340 },
      { account: 'cash:provider', amount: -81_340 },
    ]);
    expect(
      withdrawalCompletedPostings({
        membershipId: 'M7',
        amount: 80_840,
        feeEstimated: 500,
        feeActual: 650,
      }),
    ).toEqual([
      { account: 'payable:member:M7', amount: 81_340 },
      { account: 'fund:general', amount: 150 },
      { account: 'cash:provider', amount: -81_490 },
    ]);
  });

  it('LOAN_DISBURSED posts E3 exactly: receivable +33 500, fund −3 000, cash −30 500', () => {
    const args = { membershipId: 'M7', principal: 30_000, interest: 3_000, feeEstimated: 500 };
    expect(loanDisbursedPostings({ ...args, feeActual: 500 })).toEqual([
      { account: 'receivable:member:M7', amount: 33_500 },
      { account: 'fund:general', amount: -3_000 },
      { account: 'cash:provider', amount: -30_500 },
    ]);
    const cheaper = loanDisbursedPostings({ ...args, feeActual: 400 });
    expect(cheaper).toContainEqual({ account: 'fund:general', amount: -100 });
    expect(sumsToZero(cheaper)).toBe(true);
  });

  it('SOLIDARITY_DISBURSED takes A from the fund; the recipient bears the fee', () => {
    expect(
      solidarityDisbursedPostings({ amount: 20_000, feeEstimated: 500, feeActual: 500 }),
    ).toEqual([
      { account: 'fund:solidarity', amount: 20_000 },
      { account: 'cash:provider', amount: -20_000 },
    ]);
    expect(
      solidarityDisbursedPostings({ amount: 20_000, feeEstimated: 500, feeActual: 700 }),
    ).toEqual([
      { account: 'fund:solidarity', amount: 20_000 },
      { account: 'fund:general', amount: 200 },
      { account: 'cash:provider', amount: -20_200 },
    ]);
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
