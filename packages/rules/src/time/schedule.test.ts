import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  monthlyAnchorFromFirstPayout,
  monthlyPayoutDay,
  MIN_LEAD_BEFORE_FIRST_DUE_HOURS,
  nextCycleFirstPayoutAt,
  roundDates,
  roundDatesInSegments,
  rescheduleFromRound,
  roundDueAt,
  roundPayoutAt,
} from './schedule';
import { addHours } from './douala';

const utc = (iso: string) => new Date(iso);
const lastSaturday = { kind: 'LAST_WEEKDAY', weekday: 6 } as const;
// The last Saturday of November 2026 at 18:00 in Douala.
const first = utc('2026-11-28T17:00:00.000Z');

describe('round dates (R2.2)', () => {
  it('sets dueAt 24 hours before payoutAt', () => {
    expect(roundDueAt(first).toISOString()).toBe('2026-11-27T17:00:00.000Z');
  });

  it('adds 7 days per round when weekly and 14 when two-weekly', () => {
    const weekly = { firstPayoutAt: utc('2026-11-07T17:00:00.000Z'), frequency: 'WEEKLY' } as const;
    expect(roundPayoutAt(weekly, 1).toISOString()).toBe('2026-11-07T17:00:00.000Z');
    expect(roundPayoutAt(weekly, 3).toISOString()).toBe('2026-11-21T17:00:00.000Z');
    const biweekly = { ...weekly, frequency: 'BIWEEKLY' } as const;
    expect(roundPayoutAt(biweekly, 3).toISOString()).toBe('2026-12-05T17:00:00.000Z');
    expect(roundDates(biweekly, 2)).toEqual({
      payoutAt: utc('2026-11-21T17:00:00.000Z'),
      dueAt: utc('2026-11-20T17:00:00.000Z'),
    });
  });

  it('keeps weekly rounds exactly 7 days apart for any start (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1_700_000_000_000, max: 2_000_000_000_000 }),
        fc.integer({ min: 1, max: 60 }),
        (ms, k) => {
          const s = { firstPayoutAt: new Date(ms), frequency: 'WEEKLY' } as const;
          const gap = roundPayoutAt(s, k + 1).getTime() - roundPayoutAt(s, k).getTime();
          expect(gap).toBe(7 * 24 * 3_600_000);
        },
      ),
    );
  });

  it('refuses round numbers below 1', () => {
    expect(() => roundPayoutAt({ firstPayoutAt: first, frequency: 'WEEKLY' }, 0)).toThrow(
      RangeError,
    );
  });
});

describe('monthly rounds keep the first payout anchor (Q1)', () => {
  it('pays the last Saturday of every month', () => {
    const schedule = {
      firstPayoutAt: first,
      frequency: 'MONTHLY',
      monthlyAnchor: lastSaturday,
    } as const;
    expect(roundPayoutAt(schedule, 1).toISOString()).toBe('2026-11-28T17:00:00.000Z');
    expect(roundPayoutAt(schedule, 2).toISOString()).toBe('2026-12-26T17:00:00.000Z');
    expect(roundPayoutAt(schedule, 3).toISOString()).toBe('2027-01-30T17:00:00.000Z');
    expect(roundPayoutAt(schedule, 4).toISOString()).toBe('2027-02-27T17:00:00.000Z');
    expect(roundPayoutAt(schedule, 14).toISOString()).toBe('2027-12-25T17:00:00.000Z');
  });

  it('defaults to the day of the month, clamped to the last day', () => {
    const schedule = {
      firstPayoutAt: utc('2027-01-31T17:00:00.000Z'),
      frequency: 'MONTHLY',
    } as const;
    expect(roundPayoutAt(schedule, 2).toISOString()).toBe('2027-02-28T17:00:00.000Z');
    expect(roundPayoutAt(schedule, 3).toISOString()).toBe('2027-03-31T17:00:00.000Z');
    expect(roundPayoutAt(schedule, 4).toISOString()).toBe('2027-04-30T17:00:00.000Z');
    const leap = { firstPayoutAt: utc('2028-01-31T17:00:00.000Z'), frequency: 'MONTHLY' } as const;
    expect(roundPayoutAt(leap, 2).toISOString()).toBe('2028-02-29T17:00:00.000Z');
  });

  it('uses the Douala date, not the UTC date', () => {
    // 00:30 on 1 December in Douala is 23:30 UTC on 30 November.
    const schedule = {
      firstPayoutAt: utc('2026-11-30T23:30:00.000Z'),
      frequency: 'MONTHLY',
    } as const;
    expect(roundPayoutAt(schedule, 2).toISOString()).toBe('2026-12-31T23:30:00.000Z');
  });

  it('supports an nth weekday anchor (second Sunday)', () => {
    const schedule = {
      firstPayoutAt: utc('2026-11-08T14:00:00.000Z'),
      frequency: 'MONTHLY',
      monthlyAnchor: { kind: 'NTH_WEEKDAY', nth: 2, weekday: 0 },
    } as const;
    expect(roundPayoutAt(schedule, 2).toISOString()).toBe('2026-12-13T14:00:00.000Z');
    expect(roundPayoutAt(schedule, 3).toISOString()).toBe('2027-01-10T14:00:00.000Z');
  });

  it('decides the monthly day in one function', () => {
    expect(monthlyPayoutDay(2026, 11, lastSaturday)).toBe(28);
    expect(monthlyPayoutDay(2027, 2, { kind: 'DAY_OF_MONTH', day: 30 })).toBe(28);
    expect(monthlyPayoutDay(2026, 11, { kind: 'NTH_WEEKDAY', nth: 1, weekday: 0 })).toBe(1);
  });

  it('refuses a first payout that does not fall on its anchor', () => {
    const schedule = {
      firstPayoutAt: utc('2026-11-21T17:00:00.000Z'),
      frequency: 'MONTHLY',
      monthlyAnchor: lastSaturday,
    } as const;
    expect(() => roundPayoutAt(schedule, 2)).toThrow(RangeError);
  });

  it('derives the anchor from the first payout', () => {
    expect(monthlyAnchorFromFirstPayout(first, 'DAY_OF_MONTH')).toEqual({
      ok: true,
      anchor: { kind: 'DAY_OF_MONTH', day: 28 },
    });
    expect(monthlyAnchorFromFirstPayout(first, 'LAST_WEEKDAY')).toEqual({
      ok: true,
      anchor: { kind: 'LAST_WEEKDAY', weekday: 6 },
    });
    expect(monthlyAnchorFromFirstPayout(first, 'NTH_WEEKDAY')).toEqual({
      ok: true,
      anchor: { kind: 'NTH_WEEKDAY', nth: 4, weekday: 6 },
    });
    expect(monthlyAnchorFromFirstPayout(utc('2026-11-21T17:00:00.000Z'), 'LAST_WEEKDAY')).toEqual({
      ok: false,
      code: 'NOT_LAST_WEEKDAY_OF_MONTH',
    });
    expect(monthlyAnchorFromFirstPayout(utc('2026-11-29T17:00:00.000Z'), 'NTH_WEEKDAY')).toEqual({
      ok: false,
      code: 'FIFTH_WEEKDAY_NOT_ALLOWED',
    });
  });
});

describe('next cycle first payout (R2.2 across cycles)', () => {
  it('continues 7 days after the last weekly payout, at the rule set time', () => {
    expect(
      nextCycleFirstPayoutAt({
        lastPayoutAt: utc('2026-11-21T17:00:00.000Z'),
        now: addHours(utc('2026-11-21T17:00:00.000Z'), 1),
        frequency: 'WEEKLY',
        payoutTime: { hour: 18, minute: 0, monthlyAnchor: { kind: 'DAY_OF_MONTH', day: 1 } },
      }).toISOString(),
    ).toBe('2026-11-28T17:00:00.000Z');
  });

  it('takes the next monthly anchor date after the last payout', () => {
    const payoutTime = { hour: 18, minute: 0, monthlyAnchor: lastSaturday } as const;
    const lastPayoutAt = utc('2026-11-28T17:00:00.000Z');
    expect(
      nextCycleFirstPayoutAt({
        lastPayoutAt,
        frequency: 'MONTHLY',
        payoutTime,
        now: addHours(lastPayoutAt, 1),
      }).toISOString(),
    ).toBe('2026-12-26T17:00:00.000Z');
    // A later time of day never creates a payout two hours after the last one.
    expect(
      nextCycleFirstPayoutAt({
        lastPayoutAt,
        now: addHours(lastPayoutAt, 1),
        frequency: 'MONTHLY',
        payoutTime: { ...payoutTime, hour: 20 },
      }).toISOString(),
    ).toBe('2026-12-26T19:00:00.000Z');
    // Day 31 clamped to 28 February still moves on to 31 March.
    expect(
      nextCycleFirstPayoutAt({
        lastPayoutAt: utc('2027-02-28T17:00:00.000Z'),
        now: addHours(utc('2027-02-28T17:00:00.000Z'), 1),
        frequency: 'MONTHLY',
        payoutTime: { hour: 18, minute: 0, monthlyAnchor: { kind: 'DAY_OF_MONTH', day: 31 } },
      }).toISOString(),
    ).toBe('2027-03-31T17:00:00.000Z');
  });
});

describe('re-dating the remaining rounds after a frequency or payout-time change (D13.1)', () => {
  const monthly = {
    firstPayoutAt: new Date('2026-11-28T17:00:00.000Z'),
    frequency: 'MONTHLY',
    monthlyAnchor: { kind: 'LAST_WEEKDAY', weekday: 6 },
  } as const;

  it('keeps rounds before the change and continues weekly from the next round', () => {
    // Change passed during round 2 (payout 26 December): from round 3, weekly at 18:00.
    const segments = [
      { fromRound: 1, schedule: monthly },
      rescheduleFromRound({
        fromRound: 3,
        previousPayoutAt: roundPayoutAt(monthly, 2),
        now: addHours(roundPayoutAt(monthly, 2), 1),
        frequency: 'WEEKLY',
        payoutTime: { hour: 18, minute: 0, monthlyAnchor: { kind: 'LAST_WEEKDAY', weekday: 6 } },
      }),
    ];
    expect(roundDatesInSegments(segments, 2).payoutAt.toISOString()).toBe(
      '2026-12-26T17:00:00.000Z',
    );
    expect(roundDatesInSegments(segments, 3).payoutAt.toISOString()).toBe(
      '2027-01-02T17:00:00.000Z',
    );
    expect(roundDatesInSegments(segments, 4)).toEqual({
      payoutAt: new Date('2027-01-09T17:00:00.000Z'),
      dueAt: new Date('2027-01-08T17:00:00.000Z'),
    });
  });

  it('moves the payout time of the remaining rounds, keeping the monthly anchor', () => {
    const segments = [
      { fromRound: 1, schedule: monthly },
      rescheduleFromRound({
        fromRound: 2,
        previousPayoutAt: roundPayoutAt(monthly, 1),
        now: addHours(roundPayoutAt(monthly, 1), 1),
        frequency: 'MONTHLY',
        payoutTime: { hour: 16, minute: 30, monthlyAnchor: { kind: 'LAST_WEEKDAY', weekday: 6 } },
      }),
    ];
    expect(roundDatesInSegments(segments, 2).payoutAt.toISOString()).toBe(
      '2026-12-26T15:30:00.000Z',
    );
    expect(roundDatesInSegments(segments, 3).payoutAt.toISOString()).toBe(
      '2027-01-30T15:30:00.000Z',
    );
  });

  it('refuses a round before the first segment', () => {
    expect(() => roundDatesInSegments([{ fromRound: 2, schedule: monthly }], 1)).toThrow(
      RangeError,
    );
  });

  it('never puts the new first deadline in the past or before the last payout (H3)', () => {
    // Changed to the 29th at 08:00 right after a payout on the 28th at 18:00: the 29th at 08:00
    // would be due on the 28th at 08:00, before that payout. The next occurrence is used instead.
    const segment = rescheduleFromRound({
      fromRound: 2,
      previousPayoutAt: utc('2026-11-28T17:00:00.000Z'),
      now: utc('2026-11-28T17:30:00.000Z'),
      frequency: 'MONTHLY',
      payoutTime: { hour: 8, minute: 0, monthlyAnchor: { kind: 'DAY_OF_MONTH', day: 29 } },
    });
    expect(segment.schedule.firstPayoutAt.toISOString()).toBe('2026-12-29T07:00:00.000Z');
  });

  it('leaves members at least 72 hours to pay before the first new deadline (H3)', () => {
    // Weekly change applied 5 days after the last payout: the 28 November round would be due
    // on 27 November, less than 72 hours away, so the round moves to 5 December.
    const first = nextCycleFirstPayoutAt({
      lastPayoutAt: utc('2026-11-21T17:00:00.000Z'),
      now: utc('2026-11-26T09:00:00.000Z'),
      frequency: 'WEEKLY',
      payoutTime: { hour: 18, minute: 0, monthlyAnchor: { kind: 'DAY_OF_MONTH', day: 1 } },
    });
    expect(first.toISOString()).toBe('2026-12-05T17:00:00.000Z');
    expect(
      roundDueAt(first).getTime() - utc('2026-11-26T09:00:00.000Z').getTime(),
    ).toBeGreaterThanOrEqual(MIN_LEAD_BEFORE_FIRST_DUE_HOURS * 3_600_000);
  });
});
