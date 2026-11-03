import { describe, expect, it } from 'vitest';
import { addHours } from './douala';
import {
  activeHold,
  canSendExcuse,
  checkInWindow,
  isCheckInOpen,
  voteClosesAt,
  voteReminderAt,
} from './windows';

const utc = (iso: string) => new Date(iso);

describe('meeting check-in (R15.3)', () => {
  const start = utc('2026-11-28T15:00:00.000Z'); // Saturday 16:00 in Douala

  it('opens 1 hour before the start and closes 2 hours after', () => {
    expect(checkInWindow(start)).toEqual({
      opensAt: utc('2026-11-28T14:00:00.000Z'),
      closesAt: utc('2026-11-28T17:00:00.000Z'),
    });
    expect(isCheckInOpen(start, utc('2026-11-28T13:59:59.999Z'))).toBe(false);
    expect(isCheckInOpen(start, utc('2026-11-28T14:00:00.000Z'))).toBe(true);
    expect(isCheckInOpen(start, utc('2026-11-28T16:59:59.999Z'))).toBe(true);
    expect(isCheckInOpen(start, utc('2026-11-28T17:00:00.000Z'))).toBe(false);
  });

  it('accepts excuses only before the start', () => {
    expect(canSendExcuse(start, utc('2026-11-28T14:59:59.999Z'))).toBe(true);
    expect(canSendExcuse(start, start)).toBe(false);
  });
});

describe('withdrawal hold (R13.5, R5.5)', () => {
  const changed = utc('2026-11-02T10:00:00.000Z');

  it('lasts numberChangeHoldHours after a number change', () => {
    expect(
      activeHold({
        numberChangedAt: changed,
        pinResetAt: null,
        holdHours: 48,
        now: addHours(changed, 2),
      }),
    ).toEqual({ reason: 'NUMBER_CHANGE', until: utc('2026-11-04T10:00:00.000Z') });
    expect(
      activeHold({
        numberChangedAt: changed,
        pinResetAt: null,
        holdHours: 48,
        now: addHours(changed, 48),
      }),
    ).toBeNull();
  });

  it('returns the hold that ends last when a PIN reset follows a number change', () => {
    expect(
      activeHold({
        numberChangedAt: changed,
        pinResetAt: addHours(changed, 10),
        holdHours: 48,
        now: addHours(changed, 47),
      }),
    ).toEqual({ reason: 'PIN_RESET', until: utc('2026-11-04T20:00:00.000Z') });
  });

  it('has no hold when the group set 0 hours', () => {
    expect(
      activeHold({ numberChangedAt: changed, pinResetAt: null, holdHours: 0, now: changed }),
    ).toBeNull();
  });
});

describe('vote window (R11.3)', () => {
  it('closes after voteWindowHours and reminds 24 hours before', () => {
    const opens = utc('2026-11-02T08:00:00.000Z');
    expect(voteClosesAt(opens, 72)).toEqual(utc('2026-11-05T08:00:00.000Z'));
    expect(voteReminderAt(voteClosesAt(opens, 72))).toEqual(utc('2026-11-04T08:00:00.000Z'));
  });
});
