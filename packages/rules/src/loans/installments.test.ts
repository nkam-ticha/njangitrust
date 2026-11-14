import { describe, expect, it } from 'vitest';
import { roundDates } from '../time';
import { installmentDueDates, redateNextCycleInstallments } from './installments';

const monthly = {
  firstPayoutAt: new Date('2026-11-28T17:00:00.000Z'),
  frequency: 'MONTHLY',
  monthlyAnchor: { kind: 'LAST_WEEKDAY', weekday: 6 },
} as const;
const monthlyRounds = Array.from({ length: 8 }, (_, i) => roundDates(monthly, i + 1));
const dated = (dueAt: Date) => ({ status: 'DATED' as const, dueAt });

describe('installment due dates (R7.3, D16.3)', () => {
  it('E3: a loan approved during round 3 of a monthly group is due at rounds 4 and 5', () => {
    // Round 3 pays out on 30 January 2027; approval on 10 January.
    expect(
      installmentDueDates({
        approvedAt: new Date('2027-01-10T09:00:00.000Z'),
        months: 2,
        frequency: 'MONTHLY',
        rounds: monthlyRounds,
      }),
    ).toEqual([dated(monthlyRounds[3]!.dueAt), dated(monthlyRounds[4]!.dueAt)]);
  });

  it('counts rounds after the one in progress, even after its deadline has passed (monthly)', () => {
    // 29 January 20:00 UTC: round 3's deadline has passed but its payout has not.
    expect(
      installmentDueDates({
        approvedAt: new Date('2027-01-29T20:00:00.000Z'),
        months: 2,
        frequency: 'MONTHLY',
        rounds: monthlyRounds,
      }),
    ).toEqual([dated(monthlyRounds[3]!.dueAt), dated(monthlyRounds[4]!.dueAt)]);
  });

  it('uses the first round deadline on or after approval plus k months in a weekly group', () => {
    const weekly = {
      firstPayoutAt: new Date('2026-11-07T17:00:00.000Z'),
      frequency: 'WEEKLY',
    } as const;
    const rounds = Array.from({ length: 20 }, (_, i) => roundDates(weekly, i + 1));
    // Approved 2 November; +1 month = 2 December → round of 5 December (dueAt 4 December).
    expect(
      installmentDueDates({
        approvedAt: new Date('2026-11-02T09:00:00.000Z'),
        months: 2,
        frequency: 'WEEKLY',
        rounds,
      }),
    ).toEqual([
      dated(new Date('2026-12-04T17:00:00.000Z')),
      dated(new Date('2027-01-08T17:00:00.000Z')),
    ]);
  });

  it('leaves installments after the cycle "due at a round of the next cycle" (D18.2, monthly)', () => {
    // A 5-round cycle; approved during round 3: installments at rounds 4 and 5, the third next cycle.
    const due = installmentDueDates({
      approvedAt: new Date('2027-01-10T09:00:00.000Z'),
      months: 3,
      frequency: 'MONTHLY',
      rounds: monthlyRounds.slice(0, 5),
    });
    expect(due).toEqual([
      dated(monthlyRounds[3]!.dueAt),
      dated(monthlyRounds[4]!.dueAt),
      { status: 'NEXT_CYCLE', nthRound: 1, onOrAfter: null },
    ]);
  });

  it('re-dates next-cycle installments when the next cycle starts (D18.2)', () => {
    const next = {
      firstPayoutAt: new Date('2027-05-29T17:00:00.000Z'),
      frequency: 'MONTHLY',
      monthlyAnchor: monthly.monthlyAnchor,
    } as const;
    const newRounds = Array.from({ length: 3 }, (_, i) => roundDates(next, i + 1));
    expect(
      redateNextCycleInstallments(
        [
          dated(monthlyRounds[4]!.dueAt),
          { status: 'NEXT_CYCLE', nthRound: 1, onOrAfter: null },
          { status: 'NEXT_CYCLE', nthRound: 4, onOrAfter: null },
          { status: 'NEXT_CYCLE', nthRound: null, onOrAfter: new Date('2027-06-10T00:00:00.000Z') },
          { status: 'NEXT_CYCLE', nthRound: null, onOrAfter: new Date('2027-09-10T00:00:00.000Z') },
        ],
        newRounds,
      ),
    ).toEqual([
      dated(monthlyRounds[4]!.dueAt),
      dated(newRounds[0]!.dueAt),
      // A shorter cycle than the loan: still waiting for the following cycle.
      { status: 'NEXT_CYCLE', nthRound: 1, onOrAfter: null },
      dated(newRounds[1]!.dueAt),
      { status: 'NEXT_CYCLE', nthRound: null, onOrAfter: new Date('2027-09-10T00:00:00.000Z') },
    ]);
  });

  it('places a weekly installment beyond the cycle on the next cycle, on or after its date', () => {
    const weekly = {
      firstPayoutAt: new Date('2026-11-07T17:00:00.000Z'),
      frequency: 'WEEKLY',
    } as const;
    // Four weekly rounds (last deadline 27 November): one month after 2 November is beyond them.
    const rounds = Array.from({ length: 4 }, (_, i) => roundDates(weekly, i + 1));
    expect(
      installmentDueDates({
        approvedAt: new Date('2026-11-02T09:00:00.000Z'),
        months: 1,
        frequency: 'WEEKLY',
        rounds,
      }),
    ).toEqual([
      { status: 'NEXT_CYCLE', nthRound: null, onOrAfter: new Date('2026-12-02T09:00:00.000Z') },
    ]);
  });

  it('places every installment in the next cycle when approved after the last payout (D18.2)', () => {
    expect(
      installmentDueDates({
        approvedAt: new Date('2027-08-10T09:00:00.000Z'),
        months: 2,
        frequency: 'MONTHLY',
        rounds: monthlyRounds.slice(0, 5),
      }),
    ).toEqual([
      { status: 'NEXT_CYCLE', nthRound: 1, onOrAfter: null },
      { status: 'NEXT_CYCLE', nthRound: 2, onOrAfter: null },
    ]);
    expect(() =>
      installmentDueDates({
        approvedAt: new Date('2027-08-10T09:00:00.000Z'),
        months: 0,
        frequency: 'MONTHLY',
        rounds: [],
      }),
    ).toThrow(RangeError);
  });
});
