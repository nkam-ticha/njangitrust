import { describe, expect, it } from 'vitest';
import {
  DOUALA_OFFSET_MINUTES,
  formatClock,
  formatDateLong,
  formatDateShort,
  formatDateTime,
  formatTimeSpoken,
  toDouala,
} from './time';

// Friday 6 November 2026, 18:00 in Douala = 17:00 UTC.
const deadline = '2026-11-06T17:00:00.000Z';

describe('Africa/Douala conversion (spec: times stored in UTC, shown in Douala)', () => {
  it('is UTC+1 all year, with no daylight saving', () => {
    expect(DOUALA_OFFSET_MINUTES).toBe(60);
    expect(toDouala(deadline)).toEqual({
      year: 2026, month: 11, day: 6, weekday: 5, hour: 18, minute: 0,
    });
    expect(toDouala('2026-06-30T23:30:00Z')).toMatchObject({ month: 7, day: 1, hour: 0, minute: 30 });
  });

  it('crosses the year boundary', () => {
    expect(toDouala('2026-12-31T23:15:00Z')).toMatchObject({ year: 2027, month: 1, day: 1, hour: 0 });
  });
});

describe('date and time formatting, French and English', () => {
  it('formats the spec examples', () => {
    expect(formatDateTime(deadline, 'fr')).toBe('vendredi 6 novembre à 18 h');
    expect(formatDateTime(deadline, 'en')).toBe('Friday 6 November at 6 pm');
  });

  it('formats spoken times', () => {
    expect(formatTimeSpoken('2026-11-07T15:30:00Z', 'fr')).toBe('16 h 30');
    expect(formatTimeSpoken('2026-11-07T15:30:00Z', 'en')).toBe('4:30 pm');
    expect(formatTimeSpoken('2026-11-07T11:00:00Z', 'en')).toBe('12 pm');
    expect(formatTimeSpoken('2026-11-06T23:00:00Z', 'en')).toBe('12 am');
    expect(formatTimeSpoken('2026-11-06T23:00:00Z', 'fr')).toBe('0 h');
  });

  it('formats clock times for timestamps', () => {
    expect(formatClock('2026-11-05T13:32:00Z', 'fr')).toBe('14:32');
    expect(formatClock('2026-11-05T13:32:00Z', 'en')).toBe('2:32 pm');
    expect(formatClock('2026-11-05T05:00:00Z', 'fr')).toBe('06:00');
  });

  it('formats long and short dates', () => {
    expect(formatDateLong(deadline, 'fr')).toBe('vendredi 6 novembre');
    expect(formatDateLong(deadline, 'en')).toBe('Friday 6 November');
    expect(formatDateShort('2026-02-01T09:00:00Z', 'fr')).toBe('1 févr.');
    expect(formatDateShort('2026-02-01T09:00:00Z', 'en')).toBe('1 Feb');
  });

  it('adds the year only when asked', () => {
    expect(formatDateLong(deadline, 'fr', { withYear: true })).toBe('vendredi 6 novembre 2026');
    expect(formatDateShort(deadline, 'en', { withYear: true })).toBe('6 Nov 2026');
  });

  it('accepts Date objects', () => {
    expect(formatDateTime(new Date(deadline), 'fr')).toBe('vendredi 6 novembre à 18 h');
  });
});
