// Reading amounts, dates, times and phone numbers out of text, for the checks of spec 5.4.
import { findPhoneNumbers } from '@njangi/shared';

/** Thousands separators the app writes: thin and plain spaces in French, commas in English. */
const SEPARATOR = /(\d)[\s\u00a0\u202f,](?=\d{3}(?!\d))/g;

export function joinDigits(text: string): string {
  let previous = '';
  let current = text;
  while (current !== previous) {
    previous = current;
    current = current.replace(SEPARATOR, '$1');
  }
  return current;
}

/** Amounts with their currency ("11 000 FCFA", "10,000 FCFA"), as whole numbers of FCFA. */
export function amountsIn(text: string): string[] {
  return [...joinDigits(text).matchAll(/(\d+)[\s\u00a0\u202f]*(?:FCFA|XAF|francs?)/gi)].map(
    (match) => String(Number(match[1])),
  );
}

/** Every whole number of a source text, with separators removed. */
export function numbersIn(text: string): Set<string> {
  return new Set([...joinDigits(text).matchAll(/\d+/g)].map((match) => String(Number(match[0]))));
}

const MONTHS: Record<string, number> = {
  janvier: 1,
  january: 1,
  février: 2,
  fevrier: 2,
  february: 2,
  mars: 3,
  march: 3,
  avril: 4,
  april: 4,
  mai: 5,
  may: 5,
  juin: 6,
  june: 6,
  juillet: 7,
  july: 7,
  août: 8,
  aout: 8,
  august: 8,
  septembre: 9,
  september: 9,
  octobre: 10,
  october: 10,
  novembre: 11,
  november: 11,
  décembre: 12,
  decembre: 12,
  december: 12,
};
const MONTH_NAMES = Object.keys(MONTHS).join('|');
const DAY_MONTH = new RegExp(
  `(\\d{1,2})(?:er|st|nd|rd|th)?\\s+(${MONTH_NAMES})(?![\\p{L}])`,
  'giu',
);
const MONTH_DAY = new RegExp(
  `(?<![\\p{L}])(${MONTH_NAMES})\\s+(\\d{1,2})(?!\\d|\\s*(?:h|:))`,
  'giu',
);
const ISO = /(\d{4})-(\d{2})-(\d{2})/g;

/** Calendar days mentioned, as "day/month". */
export function datesIn(text: string): string[] {
  const lower = text.toLowerCase();
  return [
    ...[...lower.matchAll(DAY_MONTH)].map((m) => `${Number(m[1])}/${MONTHS[m[2]!]}`),
    ...[...lower.matchAll(MONTH_DAY)].map((m) => `${Number(m[2])}/${MONTHS[m[1]!]}`),
    ...[...lower.matchAll(ISO)].map((m) => `${Number(m[3])}/${Number(m[2])}`),
  ];
}

/** Times of day mentioned ("18 h", "18:00", "6 pm"), as minutes after midnight. */
export function timesIn(text: string): number[] {
  const lower = text.toLowerCase();
  const out: number[] = [];
  for (const m of lower.matchAll(/(?<!\d)(\d{1,2})\s?h\s?(\d{2})?(?![\p{L}\d])/gu)) {
    out.push(Number(m[1]) * 60 + Number(m[2] ?? 0));
  }
  for (const m of lower.matchAll(/(?<!\d)(\d{1,2})(?::(\d{2}))?\s?(am|pm)(?![\p{L}])/gu)) {
    const hour = (Number(m[1]) % 12) + (m[3] === 'pm' ? 12 : 0);
    out.push(hour * 60 + Number(m[2] ?? 0));
  }
  for (const m of lower.matchAll(/(?<!\d)(\d{1,2}):(\d{2})(?!\s?(?:am|pm)|\d)/g)) {
    out.push(Number(m[1]) * 60 + Number(m[2]));
  }
  return out;
}

export function hasDate(text: string): boolean {
  return (
    datesIn(text).length > 0 ||
    /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(
      text,
    )
  );
}

/** Phone numbers in a text, in E.164, whatever digits or separators were used. */
export function phonesIn(text: string): string[] {
  return findPhoneNumbers(text.normalize('NFKC'));
}

export function hasDigit(text: string): boolean {
  return /\p{Nd}/u.test(text);
}

const FRENCH =
  /(?<![\p{L}])(je|tu|ton|ta|tes|le|la|les|des|une|un|est|pas|pour|avec|que|qui|dans|sur|ne|au|du|et|ou|peux|voici|merci)(?![\p{L}])/giu;
const ENGLISH =
  /(?<![\p{L}])(the|you|your|is|are|not|for|with|that|this|and|or|can|cannot|here|of|to|in|will|has|have)(?![\p{L}])/giu;

/** The language a reply is written in; `fallback` when the text gives no sign. */
export function languageOf(text: string, fallback: 'fr' | 'en'): 'fr' | 'en' {
  const fr = (text.match(FRENCH) ?? []).length;
  const en = (text.match(ENGLISH) ?? []).length;
  if (fr === en) return fallback;
  return fr > en ? 'fr' : 'en';
}

/** A scenario pattern: a leading "(?i)" asks for a case-insensitive match. */
export function pattern(source: string): RegExp {
  const insensitive = source.startsWith('(?i)');
  return new RegExp(insensitive ? source.slice(4) : source, insensitive ? 'iu' : 'u');
}
