import { describe, expect, it } from 'vitest';
import { periodMinutes, splitPeriod } from './period';

describe('custom period units (D23)', () => {
  it('shows the largest unit that divides the period exactly', () => {
    expect(splitPeriod(1)).toEqual({ unit: 'minutes', count: 1 });
    expect(splitPeriod(5)).toEqual({ unit: 'minutes', count: 5 });
    expect(splitPeriod(59)).toEqual({ unit: 'minutes', count: 59 });
    expect(splitPeriod(60)).toEqual({ unit: 'hours', count: 1 });
    expect(splitPeriod(90)).toEqual({ unit: 'minutes', count: 90 });
    expect(splitPeriod(120)).toEqual({ unit: 'hours', count: 2 });
    expect(splitPeriod(1_440)).toEqual({ unit: 'days', count: 1 });
    expect(splitPeriod(10_080)).toEqual({ unit: 'days', count: 7 });
    expect(splitPeriod(525_600)).toEqual({ unit: 'days', count: 365 });
  });

  it('turns a typed number and unit into whole minutes', () => {
    expect(periodMinutes(1, 'minutes')).toBe(1);
    expect(periodMinutes(3, 'hours')).toBe(180);
    expect(periodMinutes(2, 'days')).toBe(2_880);
  });

  it('round-trips every typed value', () => {
    for (const unit of ['minutes', 'hours', 'days'] as const) {
      for (const count of [1, 2, 7, 30]) {
        const minutes = periodMinutes(count, unit);
        expect(periodMinutes(splitPeriod(minutes).count, splitPeriod(minutes).unit)).toBe(minutes);
      }
    }
  });
});
