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

describe('payout breakdown with debts due that are not settled yet (D13.3)', () => {
  const base = { contributions, deductions, withdrawals: [], feeSchedule: MOCK_FEE_SCHEDULE };

  it('holds them back from the next withdrawal and leaves what remains as it is', () => {
    const held = payoutBreakdown({ ...base, heldForDebts: 1_400 });
    expect(held.remaining).toBe(81_340);
    // 81 340 − 1 400 = 79 940 can be spent: the largest amount that still pays its 500 fee.
    expect(held.nextWithdrawal).toEqual({ maxAmount: 79_440, fee: 500 });
  });

  it('is the same as before when nothing is held', () => {
    expect(payoutBreakdown({ ...base, heldForDebts: 0 })).toEqual(payoutBreakdown(base));
  });

  it('never goes below nothing when the debts exceed what remains', () => {
    const held = payoutBreakdown({ ...base, heldForDebts: 500_000 });
    expect(held.remaining).toBe(81_340);
    expect(held.nextWithdrawal).toBeNull();
  });

  it('refuses a negative or fractional amount', () => {
    expect(() => payoutBreakdown({ ...base, heldForDebts: -1 })).toThrow(RangeError);
    expect(() => payoutBreakdown({ ...base, heldForDebts: 1.5 })).toThrow(RangeError);
  });
});
