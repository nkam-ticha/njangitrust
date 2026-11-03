import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addHours, fromDoualaLocal, toDoualaLocal } from './douala';

describe('Africa/Douala calendar (3.3, CLAUDE.md rule 9)', () => {
  it('is UTC+01:00 in January and in July (no daylight saving)', () => {
    for (const iso of ['2026-01-15T12:00:00.000Z', '2026-07-15T12:00:00.000Z']) {
      expect(toDoualaLocal(new Date(iso)).hour).toBe(13);
    }
  });

  it('converts Douala local fields to UTC and back', () => {
    const at = fromDoualaLocal({ year: 2026, month: 11, day: 28, hour: 18, minute: 0 });
    expect(at.toISOString()).toBe('2026-11-28T17:00:00.000Z');
    expect(toDoualaLocal(at)).toMatchObject({
      year: 2026,
      month: 11,
      day: 28,
      hour: 18,
      weekday: 6,
    });
  });

  it('moves the local date across midnight and month ends', () => {
    // 23:30 UTC on 30 November is 00:30 on 1 December in Douala.
    expect(toDoualaLocal(new Date('2026-11-30T23:30:00.000Z'))).toMatchObject({
      year: 2026,
      month: 12,
      day: 1,
      hour: 0,
      minute: 30,
    });
  });

  it('round-trips any instant (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4_102_444_800_000 }), (ms) => {
        expect(fromDoualaLocal(toDoualaLocal(new Date(ms))).getTime()).toBe(ms);
      }),
    );
  });

  it('adds whole hours only and refuses invalid dates', () => {
    expect(addHours(new Date('2026-11-02T08:00:00.000Z'), 72).toISOString()).toBe(
      '2026-11-05T08:00:00.000Z',
    );
    expect(() => addHours(new Date('2026-11-02T08:00:00.000Z'), 1.5)).toThrow(RangeError);
    expect(() => addHours(new Date(Number.NaN), 1)).toThrow(RangeError);
  });
});
