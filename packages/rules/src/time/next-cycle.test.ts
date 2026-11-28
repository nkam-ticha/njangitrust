import { describe, expect, it } from 'vitest';
import { validateNextCycleFirstPayout } from './next-cycle';
import type { MonthlyAnchor } from './schedule';

const anchor: MonthlyAnchor = { kind: 'DAY_OF_MONTH', day: 28 };
const base = {
  frequency: 'MONTHLY' as const,
  monthlyAnchor: anchor,
  previousLastPayoutAt: new Date('2026-11-28T17:00:00.000Z'),
  now: new Date('2026-11-28T18:00:00.000Z'),
};

describe('the admin chooses the next cycle first payout (D40.2, H3)', () => {
  it('accepts a monthly payout on the anchor day at least 72 hours from its deadline', () => {
    expect(
      validateNextCycleFirstPayout({
        ...base,
        firstPayoutAt: new Date('2026-12-28T17:00:00.000Z'),
      }),
    ).toEqual({ ok: true });
  });

  it('refuses a monthly date that is not on the group payout day', () => {
    expect(
      validateNextCycleFirstPayout({
        ...base,
        firstPayoutAt: new Date('2026-12-20T17:00:00.000Z'),
      }),
    ).toMatchObject({ ok: false, code: 'NOT_ON_PAYOUT_DAY' });
  });

  it('refuses a payout in the past and one before the previous cycle ended', () => {
    expect(
      validateNextCycleFirstPayout({
        ...base,
        firstPayoutAt: new Date('2026-11-28T18:00:00.000Z'),
      }),
    ).toMatchObject({ ok: false });
    expect(
      validateNextCycleFirstPayout({
        ...base,
        frequency: 'WEEKLY',
        now: new Date('2026-12-05T09:00:00.000Z'),
        previousLastPayoutAt: new Date('2026-12-04T17:00:00.000Z'),
        firstPayoutAt: new Date('2026-12-03T17:00:00.000Z'),
      }),
    ).toMatchObject({ ok: false, code: 'FIRST_PAYOUT_BEFORE_PREVIOUS' });
  });

  it('refuses a deadline closer than 72 hours (no reminder, unseen fine)', () => {
    // Weekly: deadline = payout - 24 h. Payout in 3 days means a deadline in 2 days.
    const result = validateNextCycleFirstPayout({
      ...base,
      frequency: 'WEEKLY',
      now: new Date('2026-11-29T09:00:00.000Z'),
      firstPayoutAt: new Date('2026-12-02T09:00:00.000Z'),
    });
    expect(result).toMatchObject({ ok: false, code: 'FIRST_DEADLINE_TOO_SOON' });
    expect(
      validateNextCycleFirstPayout({
        ...base,
        frequency: 'WEEKLY',
        now: new Date('2026-11-29T09:00:00.000Z'),
        firstPayoutAt: new Date('2026-12-03T09:00:00.000Z'),
      }),
    ).toEqual({ ok: true });
  });

  it('a custom group without a usable period is refused, never NaN (L9)', () => {
    const input = {
      frequency: 'CUSTOM' as const,
      previousLastPayoutAt: new Date('2026-11-24T10:00:00.000Z'),
      now: new Date('2026-11-24T12:00:00.000Z'),
      firstPayoutAt: new Date('2026-12-30T12:00:00.000Z'),
    };
    expect(validateNextCycleFirstPayout(input)).toMatchObject({
      ok: false,
      code: 'INVALID_CUSTOM_PERIOD',
    });
    expect(validateNextCycleFirstPayout({ ...input, customPeriodMinutes: 0 })).toMatchObject({
      ok: false,
      code: 'INVALID_CUSTOM_PERIOD',
    });
    expect(validateNextCycleFirstPayout({ ...input, customPeriodMinutes: 525_601 })).toMatchObject({
      ok: false,
      code: 'INVALID_CUSTOM_PERIOD',
    });
    expect(validateNextCycleFirstPayout({ ...input, customPeriodMinutes: 1.5 })).toMatchObject({
      ok: false,
      code: 'INVALID_CUSTOM_PERIOD',
    });
  });

  it('a custom period only needs its first deadline to be ahead (D23.4)', () => {
    const custom = {
      frequency: 'CUSTOM' as const,
      customPeriodMinutes: 60,
      previousLastPayoutAt: new Date('2026-11-24T10:00:00.000Z'),
      now: new Date('2026-11-24T12:00:00.000Z'),
    };
    // Period 60 min: deadline 30 min before payout; lead 72 h is capped to one period.
    expect(
      validateNextCycleFirstPayout({
        ...custom,
        firstPayoutAt: new Date('2026-11-24T13:30:01.000Z'),
      }),
    ).toEqual({ ok: true });
    expect(
      validateNextCycleFirstPayout({
        ...custom,
        firstPayoutAt: new Date('2026-11-24T12:20:00.000Z'),
      }),
    ).toMatchObject({ ok: false, code: 'FIRST_DEADLINE_TOO_SOON' });
  });
});
