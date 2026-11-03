import { describe, expect, it } from 'vitest';
import { MOCK_FEE_SCHEDULE } from '../fees';
import { loanEligibility, loanLimit } from './eligibility';

const now = new Date('2026-10-31T10:00:00.000Z');
const ok = { membershipStatus: 'ACTIVE' as const, hasActiveLoan: false, unpaidDebts: [], now };

describe('loan eligibility (R7.1)', () => {
  it('accepts an active member who is not leaving, with no active loan and no overdue debt', () => {
    expect(loanEligibility(ok)).toEqual({ ok: true });
  });

  it('refuses members leaving, inactive, with a loan or with an overdue debt', () => {
    expect(loanEligibility({ ...ok, membershipStatus: 'LEAVING' })).toEqual({
      ok: false,
      code: 'MEMBER_LEAVING',
    });
    expect(loanEligibility({ ...ok, membershipStatus: 'INVITED' })).toEqual({
      ok: false,
      code: 'NOT_ACTIVE_MEMBER',
    });
    expect(loanEligibility({ ...ok, hasActiveLoan: true })).toEqual({
      ok: false,
      code: 'ACTIVE_LOAN_EXISTS',
    });
    const overdue = {
      kind: 'FINE' as const,
      amount: 1_000,
      dueAt: new Date('2026-10-30T17:00:00.000Z'),
    };
    expect(loanEligibility({ ...ok, unpaidDebts: [overdue] })).toEqual({
      ok: false,
      code: 'OVERDUE_DEBT',
      amount: 1_000,
    });
  });

  it('does not count a debt that is not yet overdue', () => {
    const notYet = {
      kind: 'LOAN_INSTALLMENT' as const,
      amount: 5_000,
      dueAt: new Date('2026-11-27T17:00:00.000Z'),
    };
    expect(loanEligibility({ ...ok, unpaidDebts: [notYet] })).toEqual({ ok: true });
  });
});

describe('loan limit (R7.2)', () => {
  it('E3: three contributions paid with factor 1.0 give a 30 000 limit when the fund has enough', () => {
    expect(
      loanLimit({
        loanLimitFactorPermille: 1_000,
        contributionsPaidThisCycle: 30_000,
        outstandingPrincipal: 0,
        availableForLoans: 100_000,
        feeSchedule: MOCK_FEE_SCHEDULE,
      }),
    ).toEqual({ limit: 30_000, byContributions: 30_000, byAvailableFunds: 99_500 });
  });

  it('is capped by what is available for loans, keeping room for the disbursement fee (R4.3)', () => {
    expect(
      loanLimit({
        loanLimitFactorPermille: 1_000,
        contributionsPaidThisCycle: 30_000,
        outstandingPrincipal: 0,
        availableForLoans: 25_000,
        feeSchedule: MOCK_FEE_SCHEDULE,
      }),
    ).toEqual({ limit: 24_500, byContributions: 30_000, byAvailableFunds: 24_500 });
  });

  it('applies the factor in permille and subtracts principal still outstanding, never below zero', () => {
    const args = { availableForLoans: 1_000_000, feeSchedule: MOCK_FEE_SCHEDULE };
    expect(
      loanLimit({
        ...args,
        loanLimitFactorPermille: 1_500,
        contributionsPaidThisCycle: 30_000,
        outstandingPrincipal: 10_000,
      }).byContributions,
    ).toBe(35_000);
    expect(
      loanLimit({
        ...args,
        loanLimitFactorPermille: 1_000,
        contributionsPaidThisCycle: 10_000,
        outstandingPrincipal: 20_000,
      }).limit,
    ).toBe(0);
  });
});
