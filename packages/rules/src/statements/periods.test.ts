import { describe, expect, it } from 'vitest';
import { daysPeriod, monthPeriod, previousMonthPeriod, validatePeriod } from './periods';

describe('statement periods (2.14, Africa/Douala)', () => {
  it('a month runs from midnight Douala on the 1st to midnight on the 1st after, UTC+1', () => {
    expect(monthPeriod(2026, 10)).toEqual({
      start: '2026-09-30T23:00:00.000Z',
      end: '2026-10-31T23:00:00.000Z',
    });
  });

  it('December rolls into January', () => {
    expect(monthPeriod(2026, 12).end).toBe('2026-12-31T23:00:00.000Z');
  });

  it('the previous month is read in Douala time: 00:30 on 1 November Douala is still October UTC', () => {
    expect(previousMonthPeriod(new Date('2026-10-31T23:30:00.000Z'))).toEqual(
      monthPeriod(2026, 10),
    );
    expect(previousMonthPeriod(new Date('2026-11-01T06:00:00.000Z'))).toEqual(
      monthPeriod(2026, 10),
    );
    expect(previousMonthPeriod(new Date('2027-01-01T06:00:00.000Z'))).toEqual(
      monthPeriod(2026, 12),
    );
  });

  it('custom dates are whole days, both ends included', () => {
    expect(
      daysPeriod({ year: 2026, month: 10, day: 5 }, { year: 2026, month: 10, day: 5 }),
    ).toEqual({
      start: '2026-10-04T23:00:00.000Z',
      end: '2026-10-05T23:00:00.000Z',
    });
  });

  it('refuses an impossible month, an inverted period and a period longer than three years', () => {
    expect(() => monthPeriod(2026, 13)).toThrow(RangeError);
    expect(
      validatePeriod({ start: '2026-11-02T00:00:00.000Z', end: '2026-11-01T00:00:00.000Z' }),
    ).toBe('PERIOD_ENDS_BEFORE_START');
    expect(
      validatePeriod({ start: '2020-01-01T00:00:00.000Z', end: '2026-01-01T00:00:00.000Z' }),
    ).toBe('PERIOD_TOO_LONG');
    expect(validatePeriod(monthPeriod(2026, 10))).toBeNull();
  });
});
