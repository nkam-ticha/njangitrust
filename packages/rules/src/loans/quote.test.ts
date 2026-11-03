import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MOCK_FEE_SCHEDULE } from '../fees';
import { loanQuote, loanTerms } from './quote';

const round4Due = new Date('2026-11-27T17:00:00.000Z');
const round5Due = new Date('2026-12-25T17:00:00.000Z');
const round6Due = new Date('2027-01-29T17:00:00.000Z');

const base = {
  loanRatePermille: 50,
  loanMaxMonths: 3,
  feeSchedule: MOCK_FEE_SCHEDULE,
  limit: 30_000,
  installmentDueAts: [round4Due, round5Due, round6Due],
};

describe('loan terms (R7.3)', () => {
  it('E3: 30 000 for 2 months at 50‰ costs 3 000 interest, 500 fee, 33 500 in two installments of 16 750', () => {
    expect(loanQuote({ ...base, principal: 30_000, months: 2 })).toEqual({
      ok: true,
      principal: 30_000,
      months: 2,
      interest: 3_000,
      feeEstimate: 500,
      totalDue: 33_500,
      installments: [
        { number: 1, amount: 16_750, dueAt: round4Due },
        { number: 2, amount: 16_750, dueAt: round5Due },
      ],
    });
  });

  it('rounds interest half up and gives the remainder to the last installment', () => {
    // 10 001 × 50 × 3 / 1000 = 1 500.15 -> 1 500 ; total 12 001 -> 4 000, 4 000, 4 001
    expect(
      loanTerms({ principal: 10_001, months: 3, loanRatePermille: 50, feeEstimate: 500 }),
    ).toEqual({
      interest: 1_500,
      totalDue: 12_001,
      installmentAmounts: [4_000, 4_000, 4_001],
    });
    // 10 010 × 50 × 1 / 1000 = 500.5 -> 501
    expect(
      loanTerms({ principal: 10_010, months: 1, loanRatePermille: 50, feeEstimate: 0 }).interest,
    ).toBe(501);
  });

  it('refuses amounts above the limit, months outside 1 to loanMaxMonths and too-small amounts', () => {
    expect(loanQuote({ ...base, principal: 50_000, months: 3 })).toEqual({
      ok: false,
      code: 'LOAN_ABOVE_LIMIT',
      limit: 30_000,
    });
    expect(loanQuote({ ...base, principal: 10_000, months: 4 })).toEqual({
      ok: false,
      code: 'LOAN_MONTHS_OUT_OF_RANGE',
      min: 1,
      max: 3,
    });
    expect(loanQuote({ ...base, principal: 10_000, months: 0 })).toMatchObject({
      code: 'LOAN_MONTHS_OUT_OF_RANGE',
    });
    expect(loanQuote({ ...base, principal: 99, months: 1 })).toEqual({
      ok: false,
      code: 'LOAN_BELOW_MINIMUM',
      minimum: 100,
    });
    expect(loanQuote({ ...base, principal: 1.5, months: 1 })).toEqual({
      ok: false,
      code: 'INVALID_AMOUNT',
    });
    expect(() =>
      loanQuote({ ...base, principal: 10_000, months: 3, installmentDueAts: [round4Due] }),
    ).toThrow(RangeError);
  });

  it('installments always add up to the total due (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 1_000_000 }),
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 0, max: 100 }),
        (principal, months, rate) => {
          const terms = loanTerms({ principal, months, loanRatePermille: rate, feeEstimate: 500 });
          expect(terms.installmentAmounts).toHaveLength(months);
          expect(terms.installmentAmounts.reduce((a, b) => a + b, 0)).toBe(terms.totalDue);
          expect(terms.totalDue).toBe(principal + terms.interest + 500);
        },
      ),
    );
  });
});
