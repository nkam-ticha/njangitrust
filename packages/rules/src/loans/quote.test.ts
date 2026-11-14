import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MOCK_FEE_SCHEDULE } from '../fees';
import { roundDates } from '../time';
import { loanQuote, loanTerms } from './quote';

// Monthly rounds on the last Saturday; the loan is quoted during round 3 (payout 30 January 2027).
const schedule = {
  firstPayoutAt: new Date('2026-11-28T17:00:00.000Z'),
  frequency: 'MONTHLY',
  monthlyAnchor: { kind: 'LAST_WEEKDAY', weekday: 6 },
} as const;
const rounds = Array.from({ length: 8 }, (_, i) => roundDates(schedule, i + 1));
const round4Due = rounds[3]!.dueAt;
const round5Due = rounds[4]!.dueAt;

const base = {
  loanRatePermille: 50,
  loanMaxMonths: 3,
  feeSchedule: MOCK_FEE_SCHEDULE,
  limit: 30_000,
  approvedAt: new Date('2027-01-10T09:00:00.000Z'),
  frequency: 'MONTHLY' as const,
  rounds,
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
        { number: 1, amount: 16_750, due: { status: 'DATED', dueAt: round4Due } },
        { number: 2, amount: 16_750, due: { status: 'DATED', dueAt: round5Due } },
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

  it('refuses amounts above the limit, months outside 1 to loanMaxMonths and non-positive amounts', () => {
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
    // D11: no minimum beyond a positive amount; small loans are allowed.
    expect(loanQuote({ ...base, principal: 1, months: 1 })).toMatchObject({
      ok: true,
      principal: 1,
    });
    expect(loanQuote({ ...base, principal: 0, months: 1 })).toEqual({
      ok: false,
      code: 'INVALID_AMOUNT',
    });
    expect(loanQuote({ ...base, principal: 1.5, months: 1 })).toEqual({
      ok: false,
      code: 'INVALID_AMOUNT',
    });
  });

  it('quotes installments beyond the cycle as due at a round of the next cycle (D18.2)', () => {
    const quote = loanQuote({ ...base, principal: 10_000, months: 3, rounds: rounds.slice(0, 4) });
    expect(quote.ok && quote.installments.map((i) => i.due)).toEqual([
      { status: 'DATED', dueAt: round4Due },
      { status: 'NEXT_CYCLE', nthRound: 1, onOrAfter: null },
      { status: 'NEXT_CYCLE', nthRound: 2, onOrAfter: null },
    ]);
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
