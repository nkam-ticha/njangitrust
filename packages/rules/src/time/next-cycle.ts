// The first payout of a cycle after the first, chosen by the admin (D40.2). R2.2, H3, D13.2, D23.4.

import type { Refusal } from '../result';
import { assertDate, HOUR_MS, toDoualaLocal } from './douala';
import {
  dueLeadMs,
  MAX_CUSTOM_PERIOD_MINUTES,
  MIN_CUSTOM_PERIOD_MINUTES,
  MIN_LEAD_BEFORE_FIRST_DUE_HOURS,
  monthlyPayoutDay,
  roundDueAt,
  type Frequency,
  type MonthlyAnchor,
} from './schedule';

/**
 * D40.2: the admin picks the date and time of the new cycle's first payout. It must be usable:
 * - monthly groups keep their payout day (D13.2): the date must fall on it, or round dates would
 *   not follow the anchor;
 * - its deadline must come after the previous cycle's last payout (rounds never overlap, R2.2);
 * - H3: its deadline is at least 72 hours away (a custom period: the shorter of 72 hours and one
 *   period, D23.4), so the reminder still goes out and nobody is fined for a deadline they could
 *   not see coming.
 * `nextCycleFirstPayoutAt` gives the earliest date that passes.
 */
export function validateNextCycleFirstPayout(input: {
  firstPayoutAt: Date;
  previousLastPayoutAt: Date;
  now: Date;
  frequency: Frequency;
  customPeriodMinutes?: number;
  monthlyAnchor?: MonthlyAnchor;
}):
  | { ok: true }
  | Refusal<
      | 'NOT_ON_PAYOUT_DAY'
      | 'FIRST_PAYOUT_BEFORE_PREVIOUS'
      | 'FIRST_DEADLINE_TOO_SOON'
      | 'INVALID_CUSTOM_PERIOD'
    > {
  assertDate(input.firstPayoutAt, 'firstPayoutAt');
  const last = assertDate(input.previousLastPayoutAt, 'previousLastPayoutAt');
  const now = assertDate(input.now, 'now');
  // L9: a custom group needs a whole number of minutes (D23); anything else is refused, not NaN.
  if (
    input.frequency === 'CUSTOM' &&
    !(
      Number.isSafeInteger(input.customPeriodMinutes) &&
      (input.customPeriodMinutes as number) >= MIN_CUSTOM_PERIOD_MINUTES &&
      (input.customPeriodMinutes as number) <= MAX_CUSTOM_PERIOD_MINUTES
    )
  ) {
    return { ok: false, code: 'INVALID_CUSTOM_PERIOD' };
  }
  if (input.frequency === 'MONTHLY' && input.monthlyAnchor) {
    const local = toDoualaLocal(input.firstPayoutAt);
    if (monthlyPayoutDay(local.year, local.month, input.monthlyAnchor) !== local.day) {
      return { ok: false, code: 'NOT_ON_PAYOUT_DAY' };
    }
  }
  const lead = dueLeadMs({
    frequency: input.frequency,
    customPeriodMinutes: input.customPeriodMinutes,
  });
  const due = roundDueAt(input.firstPayoutAt, lead).getTime();
  if (due <= last) return { ok: false, code: 'FIRST_PAYOUT_BEFORE_PREVIOUS' };
  const period =
    input.frequency === 'CUSTOM' ? (input.customPeriodMinutes as number) * 60_000 : Infinity;
  const earliestDue = now + Math.min(MIN_LEAD_BEFORE_FIRST_DUE_HOURS * HOUR_MS, period);
  if (due < earliestDue) return { ok: false, code: 'FIRST_DEADLINE_TOO_SOON' };
  return { ok: true };
}
