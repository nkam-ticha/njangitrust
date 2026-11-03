import type { Lang } from './lang';

// Display of UTC instants in Africa/Douala time (CLAUDE.md rule 9).
// Douala is UTC+01:00 all year with no daylight saving, so the offset is a
// constant and formatting needs no Intl: every device prints the same text.

export const DOUALA_OFFSET_MINUTES = 60;

export interface DoualaParts {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  hour: number;
  minute: number;
}

type Instant = Date | string;

export function toDouala(instant: Instant): DoualaParts {
  const ms = (instant instanceof Date ? instant : new Date(instant)).getTime();
  if (Number.isNaN(ms)) throw new RangeError(`Invalid date: ${String(instant)}`);
  const local = new Date(ms + DOUALA_OFFSET_MINUTES * 60_000);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    weekday: local.getUTCDay(),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
  };
}

const WEEKDAYS: Record<Lang, string[]> = {
  fr: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};
const MONTHS: Record<Lang, string[]> = {
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre',
    'octobre', 'novembre', 'décembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
    'October', 'November', 'December'],
};
const MONTHS_SHORT: Record<Lang, string[]> = {
  fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.',
    'nov.', 'déc.'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

const pad = (n: number) => String(n).padStart(2, '0');

function twelveHour(hour: number): { h: number; suffix: 'am' | 'pm' } {
  return { h: hour % 12 === 0 ? 12 : hour % 12, suffix: hour < 12 ? 'am' : 'pm' };
}

export interface DateOptions {
  withYear?: boolean;
}

/** "vendredi 6 novembre" / "Friday 6 November". */
export function formatDateLong(instant: Instant, lang: Lang, options: DateOptions = {}): string {
  const p = toDouala(instant);
  const year = options.withYear ? ` ${p.year}` : '';
  return `${WEEKDAYS[lang][p.weekday]} ${p.day} ${MONTHS[lang][p.month - 1]}${year}`;
}

/** "1 févr." / "1 Feb", for dense lists such as the Registre. */
export function formatDateShort(instant: Instant, lang: Lang, options: DateOptions = {}): string {
  const p = toDouala(instant);
  const year = options.withYear ? ` ${p.year}` : '';
  return `${p.day} ${MONTHS_SHORT[lang][p.month - 1]}${year}`;
}

/** Time as said in a sentence: "18 h", "16 h 30" / "6 pm", "4:30 pm". */
export function formatTimeSpoken(instant: Instant, lang: Lang): string {
  const { hour, minute } = toDouala(instant);
  if (lang === 'fr') return minute === 0 ? `${hour} h` : `${hour} h ${pad(minute)}`;
  const { h, suffix } = twelveHour(hour);
  return minute === 0 ? `${h} ${suffix}` : `${h}:${pad(minute)} ${suffix}`;
}

/** Time on a timestamp: "14:32" / "2:32 pm". */
export function formatClock(instant: Instant, lang: Lang): string {
  const { hour, minute } = toDouala(instant);
  if (lang === 'fr') return `${pad(hour)}:${pad(minute)}`;
  const { h, suffix } = twelveHour(hour);
  return `${h}:${pad(minute)} ${suffix}`;
}

/** "vendredi 6 novembre à 18 h" / "Friday 6 November at 6 pm". */
export function formatDateTime(instant: Instant, lang: Lang, options: DateOptions = {}): string {
  const joiner = lang === 'fr' ? 'à' : 'at';
  return `${formatDateLong(instant, lang, options)} ${joiner} ${formatTimeSpoken(instant, lang)}`;
}
