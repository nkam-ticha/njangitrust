// How a custom round period (whole minutes, D23) is typed and shown: a number and a unit.

export type PeriodUnit = 'minutes' | 'hours' | 'days';

const MINUTES_PER: Record<PeriodUnit, number> = { minutes: 1, hours: 60, days: 1_440 };

/** A typed number of minutes, hours or days as whole minutes. */
export function periodMinutes(count: number, unit: PeriodUnit): number {
  return count * MINUTES_PER[unit];
}

/** The largest unit that divides the period exactly: 120 is "2 hours", 90 is "90 minutes". */
export function splitPeriod(minutes: number): { unit: PeriodUnit; count: number } {
  if (minutes % MINUTES_PER.days === 0) return { unit: 'days', count: minutes / MINUTES_PER.days };
  if (minutes % MINUTES_PER.hours === 0) {
    return { unit: 'hours', count: minutes / MINUTES_PER.hours };
  }
  return { unit: 'minutes', count: minutes };
}
