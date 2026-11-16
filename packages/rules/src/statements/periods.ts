// Statement periods (spec 2.14): a month, a cycle or custom dates, always in Africa/Douala days
// and stored in UTC (CLAUDE.md rule 9). `start` is included and `end` excluded.

import { DAY_MS, fromDoualaLocal, toDoualaLocal } from '../time';
import type { StatementPeriod } from './types';

/** Longest statement period: three years (a cycle is at most 50 rounds of one month). */
export const MAX_PERIOD_DAYS = 3 * 366;

export type PeriodRefusal = 'PERIOD_ENDS_BEFORE_START' | 'PERIOD_TOO_LONG' | 'PERIOD_INVALID';

/** The whole calendar month, midnight to midnight Douala time (`month` 1 to 12). */
export function monthPeriod(year: number, month: number): StatementPeriod {
  if (!Number.isSafeInteger(year) || !Number.isSafeInteger(month) || month < 1 || month > 12) {
    throw new RangeError('a month is 1 to 12');
  }
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return {
    start: fromDoualaLocal({ year, month, day: 1 }).toISOString(),
    end: fromDoualaLocal({ ...next, day: 1 }).toISOString(),
  };
}

/** spec 2.9 statements.monthly: the month before the Douala month `now` falls in. */
export function previousMonthPeriod(now: Date): StatementPeriod {
  const local = toDoualaLocal(now);
  return local.month === 1
    ? monthPeriod(local.year - 1, 12)
    : monthPeriod(local.year, local.month - 1);
}

interface Day {
  year: number;
  month: number;
  day: number;
}

/** Custom dates: from the first day's midnight to the end of the last day, both days included. */
export function daysPeriod(from: Day, to: Day): StatementPeriod {
  return {
    start: fromDoualaLocal({ ...from }).toISOString(),
    end: fromDoualaLocal({ ...to, day: to.day + 1 }).toISOString(),
  };
}

/** A period must be ordered and not longer than three years; null when it is fine. */
export function validatePeriod(period: StatementPeriod): PeriodRefusal | null {
  const start = Date.parse(period.start);
  const end = Date.parse(period.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'PERIOD_INVALID';
  if (end < start) return 'PERIOD_ENDS_BEFORE_START';
  if ((end - start) / DAY_MS > MAX_PERIOD_DAYS) return 'PERIOD_TOO_LONG';
  return null;
}
