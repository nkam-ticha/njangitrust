import { describe, expect, it } from 'vitest';
import { MOCK_FEE_SCHEDULE } from '../fees';
import { payoutBreakdown } from './breakdown';

// FSD section 6 worked example (= E5): ten payments of round 4, each 10 000 with a 91 fee share.
const contributions = Array.from({ length: 10 }, () => ({ amount: 10_000, feeShare: 91 }));
const deductions = [
  { kind: 'LOAN_INSTALLMENT' as const, amount: 16_750 },
  { kind: 'FINE' as const, amount: 1_000 },
];

describe('payout breakdown (CAI-03, Flow B, FEE-03)', () => {
  it('shows collected, fees, deductions and what can still be received (FSD example: 81 340 / 80 840)', () => {
    expect(
      payoutBreakdown({
        contributions,
        deductions,
        withdrawals: [],
        feeSchedule: MOCK_FEE_SCHEDULE,
      }),
    ).toEqual({
      collected: 100_000,
      collectionFees: 910,
      credited: 99_090,
      deductions,
      deductionsTotal: 17_750,
      withdrawn: 0,
      withdrawalFees: 0,
      remaining: 81_340,
      nextWithdrawal: { maxAmount: 80_840, fee: 500 },
    });
  });

  it('counts withdrawals and their fees, down to nothing left', () => {
    expect(
      payoutBreakdown({
        contributions,
        deductions,
        withdrawals: [{ amount: 80_840, fee: 500 }],
        feeSchedule: MOCK_FEE_SCHEDULE,
      }),
    ).toMatchObject({ withdrawn: 80_840, withdrawalFees: 500, remaining: 0, nextWithdrawal: null });
  });

  it('offers no next withdrawal below the 100 FCFA minimum', () => {
    const small = payoutBreakdown({
      contributions: [{ amount: 1_000, feeShare: 9 }],
      deductions: [{ kind: 'FINE', amount: 400 }],
      withdrawals: [],
      feeSchedule: MOCK_FEE_SCHEDULE,
    });
    expect(small).toMatchObject({ remaining: 591, nextWithdrawal: null });
  });

  it('refuses inconsistent figures', () => {
    expect(() =>
      payoutBreakdown({
        contributions: [{ amount: 1_000, feeShare: 1_001 }],
        deductions: [],
        withdrawals: [],
        feeSchedule: MOCK_FEE_SCHEDULE,
      }),
    ).toThrow(RangeError);
    expect(() =>
      payoutBreakdown({
        contributions: [{ amount: 1_000, feeShare: 9 }],
        deductions: [{ kind: 'FINE', amount: 2_000 }],
        withdrawals: [],
        feeSchedule: MOCK_FEE_SCHEDULE,
      }),
    ).toThrow(RangeError);
  });
});
