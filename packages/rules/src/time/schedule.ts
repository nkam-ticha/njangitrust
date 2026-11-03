// Round dates (R2.2) and the monthly payout day (Q1, docs/DECISIONS.md).

import type { Refusal } from '../result';
import {
  addHours,
  assertDate,
  DAY_MS,
  daysInMonth,
  fromDoualaLocal,
  toDoualaLocal,
  weekdayOf,
  type Weekday,
} from './douala';

/** R2.2: the payment deadline is this many hours before the payout. */
export const DUE_BEFORE_PAYOUT_HOURS = 24;

export type Frequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';

/**
 * Q1: how a monthly group picks its payout day each month. The default is the day of the month of
 * the first payout; a group whose first payout is "the last Saturday" uses LAST_WEEKDAY.
 */
export type MonthlyAnchor =
  | { kind: 'DAY_OF_MONTH'; day: number }
  | { kind: 'LAST_WEEKDAY'; weekday: Weekday }
  | { kind: 'NTH_WEEKDAY'; nth: 1 | 2 | 3 | 4; weekday: Weekday };

export type AnchorKind = MonthlyAnchor['kind'];

/** 3.2 payoutTime: local Douala time of day, plus the monthly day rule (Q1). */
export interface PayoutTime {
  hour: number;
  minute: number;
  monthlyAnchor: MonthlyAnchor;
}

/** R2.2: what fixes the round dates of one cycle. */
export interface PayoutSchedule {
  firstPayoutAt: Date;
  frequency: Frequency;
  /** MONTHLY only. Defaults to the day of the month of `firstPayoutAt` (Q1). */
  monthlyAnchor?: MonthlyAnchor;
}

/**
 * Q1, R2.2: the day of the month on which a monthly round pays out. This is the only function that
 * decides it, so changing the answer to Q1 means changing this function.
 */
export function monthlyPayoutDay(year: number, month: number, anchor: MonthlyAnchor): number {
  const dim = daysInMonth(year, month);
  switch (anchor.kind) {
    case 'DAY_OF_MONTH':
      if (!Number.isSafeInteger(anchor.day) || anchor.day < 1 || anchor.day > 31) {
        throw new RangeError('anchor day must be 1–31');
      }
      return Math.min(anchor.day, dim);
    case 'LAST_WEEKDAY': {
      const back = (weekdayOf(year, month, dim) - anchor.weekday + 7) % 7;
      return dim - back;
    }
    case 'NTH_WEEKDAY': {
      const offset = (anchor.weekday - weekdayOf(year, month, 1) + 7) % 7;
      return 1 + offset + 7 * (anchor.nth - 1);
    }
  }
}

/** Q1: the monthly anchor described by a first payout date (e.g. "the last Saturday"). */
export function monthlyAnchorFromFirstPayout(
  firstPayoutAt: Date,
  kind: AnchorKind,
):
  | { ok: true; anchor: MonthlyAnchor }
  | Refusal<'NOT_LAST_WEEKDAY_OF_MONTH' | 'FIFTH_WEEKDAY_NOT_ALLOWED'> {
  const local = toDoualaLocal(firstPayoutAt);
  if (kind === 'DAY_OF_MONTH') return { ok: true, anchor: { kind, day: local.day } };
  if (kind === 'LAST_WEEKDAY') {
    if (local.day + 7 <= daysInMonth(local.year, local.month)) {
      return { ok: false, code: 'NOT_LAST_WEEKDAY_OF_MONTH' };
    }
    return { ok: true, anchor: { kind, weekday: local.weekday } };
  }
  const nth = Math.floor((local.day - 1) / 7) + 1;
  if (nth > 4) return { ok: false, code: 'FIFTH_WEEKDAY_NOT_ALLOWED' };
  return { ok: true, anchor: { kind, nth: nth as 1 | 2 | 3 | 4, weekday: local.weekday } };
}

/** R2.2: payout time of round k (1-based). Weekly +7 days, two-weekly +14, monthly per Q1. */
export function roundPayoutAt(schedule: PayoutSchedule, k: number): Date {
  if (!Number.isSafeInteger(k) || k < 1) throw new RangeError('round number must be 1 or more');
  const first = assertDate(schedule.firstPayoutAt, 'firstPayoutAt');
  if (schedule.frequency === 'WEEKLY') return new Date(first + (k - 1) * 7 * DAY_MS);
  if (schedule.frequency === 'BIWEEKLY') return new Date(first + (k - 1) * 14 * DAY_MS);
  const local = toDoualaLocal(schedule.firstPayoutAt);
  const anchor: MonthlyAnchor = schedule.monthlyAnchor ?? { kind: 'DAY_OF_MONTH', day: local.day };
  if (monthlyPayoutDay(local.year, local.month, anchor) !== local.day) {
    throw new RangeError('the first payout does not fall on the monthly anchor');
  }
  const monthIndex = local.year * 12 + (local.month - 1) + (k - 1);
  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  return fromDoualaLocal({
    year,
    month,
    day: monthlyPayoutDay(year, month, anchor),
    hour: local.hour,
    minute: local.minute,
    second: local.second,
    millisecond: local.millisecond,
  });
}

/** R2.2: the payment deadline (dueAt) is 24 hours before the payout. */
export function roundDueAt(payoutAt: Date): Date {
  return addHours(payoutAt, -DUE_BEFORE_PAYOUT_HOURS);
}

/** R2.2: payout time and payment deadline of round k. */
export function roundDates(schedule: PayoutSchedule, k: number): { payoutAt: Date; dueAt: Date } {
  const payoutAt = roundPayoutAt(schedule, k);
  return { payoutAt, dueAt: roundDueAt(payoutAt) };
}

/**
 * R2.2 across cycles: the next cycle's first payout continues the schedule after the previous
 * cycle's last payout, at the rule set's payout time. Monthly: the next anchor day strictly after
 * the last payout's Douala date.
 */
export function nextCycleFirstPayoutAt(input: {
  lastPayoutAt: Date;
  frequency: Frequency;
  payoutTime: PayoutTime;
}): Date {
  const local = toDoualaLocal(input.lastPayoutAt);
  const { hour, minute, monthlyAnchor } = input.payoutTime;
  if (input.frequency !== 'MONTHLY') {
    const days = input.frequency === 'WEEKLY' ? 7 : 14;
    return fromDoualaLocal({
      year: local.year,
      month: local.month,
      day: local.day + days,
      hour,
      minute,
    });
  }
  const thisMonthDay = monthlyPayoutDay(local.year, local.month, monthlyAnchor);
  if (thisMonthDay > local.day) {
    return fromDoualaLocal({
      year: local.year,
      month: local.month,
      day: thisMonthDay,
      hour,
      minute,
    });
  }
  const year = local.month === 12 ? local.year + 1 : local.year;
  const month = local.month === 12 ? 1 : local.month + 1;
  return fromDoualaLocal({
    year,
    month,
    day: monthlyPayoutDay(year, month, monthlyAnchor),
    hour,
    minute,
  });
}
