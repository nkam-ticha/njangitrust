// Africa/Douala calendar arithmetic (3.3, CLAUDE.md rule 9). Every input and output is a UTC
// instant. Douala is UTC+01:00 all year with no daylight saving; local fields are used only to decide
// calendar days. The clock is never read here: `now` is always an argument.

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;
/** Africa/Douala offset from UTC, constant all year (no daylight saving). */
export const DOUALA_UTC_OFFSET_HOURS = 1;
const OFFSET_MS = DOUALA_UTC_OFFSET_HOURS * HOUR_MS;

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday … 6 = Saturday

/** Calendar fields of an instant in Africa/Douala. `month` is 1–12. */
export interface DoualaDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  weekday: Weekday;
}

/** Milliseconds of a valid Date, or a RangeError. */
export function assertDate(at: Date, label = 'date'): number {
  const ms = at instanceof Date ? at.getTime() : Number.NaN;
  if (!Number.isFinite(ms)) throw new RangeError(`${label} must be a valid Date`);
  return ms;
}

/** 3.3: adds a whole number of hours to a UTC instant. */
export function addHours(at: Date, hours: number): Date {
  if (!Number.isSafeInteger(hours)) throw new RangeError('hours must be an integer');
  return new Date(assertDate(at) + hours * HOUR_MS);
}

/** 3.3: the Africa/Douala calendar fields of a UTC instant. */
export function toDoualaLocal(at: Date): DoualaDateTime {
  const shifted = new Date(assertDate(at) + OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    millisecond: shifted.getUTCMilliseconds(),
    weekday: shifted.getUTCDay() as Weekday,
  };
}

/** 3.3: the UTC instant of a local Africa/Douala date and time. Day overflow rolls over. */
export function fromDoualaLocal(parts: {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
  millisecond?: number;
}): Date {
  const ms = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
    parts.millisecond ?? 0,
  );
  if (!Number.isFinite(ms)) throw new RangeError('invalid local date');
  return new Date(ms - OFFSET_MS);
}

/** Number of days in a month (`month` 1–12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Weekday of a calendar date (`month` 1–12). */
export function weekdayOf(year: number, month: number, day: number): Weekday {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() as Weekday;
}
