// Display formats of the developer console (D28). Short dates and grouped phone numbers keep each
// row readable on a phone; the instant is stored in UTC and shown in Africa/Douala (rule 9).
import { formatClock, formatDateShort, type Lang } from '@njangi/shared';

/** "23 nov. 2026 · 01:56" (French), "23 Nov 2026 · 1:56 am" (English). */
export function formatDeveloperInstant(instant: string, lang: Lang): string {
  return `${formatDateShort(instant, lang, { withYear: true })} · ${formatClock(instant, lang)}`;
}

/** "+237 699 771 557" for a Cameroon number; any other number is shown as it is. */
export function formatDeveloperPhone(phone: string): string {
  const match = /^\+237(\d{3})(\d{3})(\d{3})$/.exec(phone);
  return match ? `+237 ${match[1]} ${match[2]} ${match[3]}` : phone;
}
