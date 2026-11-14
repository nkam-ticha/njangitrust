import { describe, expect, it } from 'vitest';
import { shouldPush } from './delivery-rules';

// Douala is UTC+1: 20:30 UTC is 21:30 in Douala.
const at = (doualaHour: number, minute = 0) =>
  new Date(Date.UTC(2026, 10, 6, doualaHour - 1, minute));
const prefs = {
  mutedCategories: [] as string[],
  quietStartMinute: 21 * 60,
  quietEndMinute: 7 * 60,
};

describe('push delivery (spec 1.8, 2.13, FSD NOT-03)', () => {
  it('pushes outside quiet hours', () => {
    expect(shouldPush({ category: 'MONEY', prefs, now: at(12) })).toBe(true);
    expect(shouldPush({ category: 'MONEY', prefs, now: at(20, 59) })).toBe(true);
    expect(shouldPush({ category: 'MONEY', prefs, now: at(7) })).toBe(true);
  });

  it('holds pushes during quiet hours, across midnight, in Douala time', () => {
    expect(shouldPush({ category: 'MONEY', prefs, now: at(21) })).toBe(false);
    expect(shouldPush({ category: 'VOTES', prefs, now: at(23, 30) })).toBe(false);
    expect(shouldPush({ category: 'REMINDERS', prefs, now: at(6, 59) })).toBe(false);
  });

  it('handles quiet hours that do not cross midnight, and none at all', () => {
    const lunch = { ...prefs, quietStartMinute: 12 * 60, quietEndMinute: 14 * 60 };
    expect(shouldPush({ category: 'GROUP', prefs: lunch, now: at(13) })).toBe(false);
    expect(shouldPush({ category: 'GROUP', prefs: lunch, now: at(22) })).toBe(true);
    const none = { ...prefs, quietStartMinute: 0, quietEndMinute: 0 };
    expect(shouldPush({ category: 'GROUP', prefs: none, now: at(3) })).toBe(true);
  });

  it('never pushes a muted category', () => {
    expect(
      shouldPush({
        category: 'GROUP',
        prefs: { ...prefs, mutedCategories: ['GROUP'] },
        now: at(12),
      }),
    ).toBe(false);
  });

  it('always pushes security alerts, even muted and in quiet hours', () => {
    const all = { ...prefs, mutedCategories: ['SECURITY', 'MONEY'] };
    expect(shouldPush({ category: 'SECURITY', prefs: all, now: at(3) })).toBe(true);
  });
});
