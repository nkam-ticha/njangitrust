// Time windows: meeting check-in (R15.3), withdrawal holds (R13.5, R5.5, spec 2.10) and votes
// (R11.3, spec 2.9).

import { addHours, assertDate } from './douala';

/** R15.3: check-in opens this many hours before a meeting starts. */
export const CHECK_IN_OPENS_BEFORE_HOURS = 1;
/** R15.3: check-in closes this many hours after a meeting starts. */
export const CHECK_IN_CLOSES_AFTER_HOURS = 2;
/** Spec 2.9 votes.remind: reminder this many hours before a vote closes. */
export const VOTE_REMINDER_BEFORE_HOURS = 24;

/** R15.3: check-in window of a meeting, from 1 hour before to 2 hours after the start. */
export function checkInWindow(startsAt: Date): { opensAt: Date; closesAt: Date } {
  return {
    opensAt: addHours(startsAt, -CHECK_IN_OPENS_BEFORE_HOURS),
    closesAt: addHours(startsAt, CHECK_IN_CLOSES_AFTER_HOURS),
  };
}

/** R15.3: true while check-in is open (opensAt inclusive, closesAt exclusive). */
export function isCheckInOpen(startsAt: Date, now: Date): boolean {
  const { opensAt, closesAt } = checkInWindow(startsAt);
  const t = assertDate(now, 'now');
  return t >= opensAt.getTime() && t < closesAt.getTime();
}

/** R15.3, R6.3: an excuse counts only when sent before the meeting starts. */
export function canSendExcuse(startsAt: Date, now: Date): boolean {
  return assertDate(now, 'now') < assertDate(startsAt, 'startsAt');
}

export type HoldReason = 'NUMBER_CHANGE' | 'PIN_RESET';

/**
 * R13.5, R5.5, spec 2.10: the withdrawal hold after a payment number change or a PIN reset, or
 * null. When both are active, the one that ends last is returned.
 */
export function activeHold(input: {
  numberChangedAt: Date | null;
  pinResetAt: Date | null;
  holdHours: number;
  now: Date;
}): { reason: HoldReason; until: Date } | null {
  const now = assertDate(input.now, 'now');
  let latest: { reason: HoldReason; until: Date } | null = null;
  const events: [HoldReason, Date | null][] = [
    ['NUMBER_CHANGE', input.numberChangedAt],
    ['PIN_RESET', input.pinResetAt],
  ];
  for (const [reason, at] of events) {
    if (!at) continue;
    const until = addHours(at, input.holdHours);
    if (until.getTime() > now && (!latest || until.getTime() > latest.until.getTime())) {
      latest = { reason, until };
    }
  }
  return latest;
}

/** R11.3: a proposal closes `windowHours` after it opens. */
export function voteClosesAt(opensAt: Date, windowHours: number): Date {
  return addHours(opensAt, windowHours);
}

/** Spec 2.9 votes.remind: 24 hours before a proposal closes. */
export function voteReminderAt(closesAt: Date): Date {
  return addHours(closesAt, -VOTE_REMINDER_BEFORE_HOURS);
}
