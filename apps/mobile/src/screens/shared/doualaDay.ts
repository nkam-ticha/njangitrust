// Day and time helpers for the date and time fields (spec 3.3: stored in UTC, scheduled and shown in
// Africa/Douala). The offset comes from the shared constant, never from the device clock.
import { DOUALA_OFFSET_MINUTES, toDouala } from '@njangi/shared';

const pad = (n: number) => String(n).padStart(2, '0');

/** Today's day in Douala as `YYYY-MM-DD`, for the date fields. */
export function doualaDay(instant: Date | string): string {
  const p = toDouala(instant);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** A Douala day and `HH:MM` as a UTC instant (ISO string). */
export function doualaInstant(day: string, time: string): string {
  const sign = DOUALA_OFFSET_MINUTES >= 0 ? '+' : '-';
  const abs = Math.abs(DOUALA_OFFSET_MINUTES);
  const offset = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return new Date(`${day}T${time}:00${offset}`).toISOString();
}

/** Whole days between two Douala days (`YYYY-MM-DD`), for period checks. */
export function addDays(day: string, count: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d + count));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}
