// Cameroon payment numbers (R13.1) and phone privacy helpers (spec 1.5, 2.11, 4.8).

export type Operator = 'MTN' | 'ORANGE' | 'UNKNOWN';

const E164_CM = /^\+2376\d{8}$/;

/** The output-guard pattern from spec 4.8, global so it can scan free text. */
export const PHONE_PATTERN = /(?:\+?237[\s.-]?)?6(?:[\s.-]?\d){8}/g;

/** Returns `+2376XXXXXXXX`, or null if the input isn't a 9-digit Cameroon mobile number. */
export function normalizeCameroonPhone(input: string): string | null {
  let digits = input.replace(/[\s.\-()]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length === 12 && digits.startsWith('237')) digits = digits.slice(3);
  if (!/^6\d{8}$/.test(digits)) return null;
  return `+237${digits}`;
}

export function isCameroonE164(value: string): boolean {
  return E164_CM.test(value);
}

function nationalDigits(e164: string): string {
  if (!isCameroonE164(e164)) throw new Error('Expected a +2376XXXXXXXX number');
  return e164.slice(4);
}

/** `6•• •• •7 89`: the first digit and the last three. */
export function maskNumber(e164: string): string {
  const d = nationalDigits(e164);
  return `${d[0]}•• •• •${d[6]} ${d.slice(7)}`;
}

/** The owner's own number, grouped `677 12 34 56`. Only ever shown to its owner. */
export function formatOwnNumber(e164: string): string {
  const d = nationalDigits(e164);
  return `${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7)}`;
}

/** Best guess from the prefix, used to pre-fill the operator; the member confirms it. */
export function detectOperator(e164: string): Operator {
  const d = nationalDigits(e164);
  const p2 = Number(d.slice(0, 2));
  const p3 = Number(d.slice(0, 3));
  if (p2 === 67 || (p3 >= 650 && p3 <= 654) || (p3 >= 680 && p3 <= 684)) return 'MTN';
  if (p2 === 69 || (p3 >= 655 && p3 <= 659) || p3 === 640) return 'ORANGE';
  return 'UNKNOWN';
}

const DECIMAL_DIGIT = /\p{Nd}/u;

/** The value of any Unicode decimal digit: each script's digits are a run of ten from its zero. */
function digitValue(digit: string): number {
  const cp = digit.codePointAt(0) ?? 0;
  let start = cp;
  while (cp - start < 60 && DECIMAL_DIGIT.test(String.fromCodePoint(start - 1))) start--;
  return (cp - start) % 10;
}

/**
 * The text with full-width and other-script digits folded to ASCII (NFKC, then digit values),
 * and for each folded UTF-16 unit the span of the original text it came from. Lets the
 * phone scanner see "６７７…" or "٦٧٧…" while masking only the original characters.
 */
function foldDigits(text: string): { folded: string; starts: number[]; ends: number[] } {
  let folded = '';
  const starts: number[] = [];
  const ends: number[] = [];
  for (let i = 0; i < text.length;) {
    const char = String.fromCodePoint(text.codePointAt(i) ?? 0);
    const unit = char
      .normalize('NFKC')
      .replace(/\p{Nd}/gu, (digit) => (/[0-9]/.test(digit) ? digit : String(digitValue(digit))));
    for (let k = 0; k < unit.length; k++) {
      starts.push(i);
      ends.push(i + char.length);
    }
    folded += unit;
    i += char.length;
  }
  return { folded, starts, ends };
}

/** Every phone number found in a text, normalised to E.164, whatever digits it is written in. */
export function findPhoneNumbers(text: string): string[] {
  const found: string[] = [];
  for (const match of foldDigits(text).folded.matchAll(PHONE_PATTERN)) {
    const normalized = normalizeCameroonPhone(match[0]);
    if (normalized) found.push(normalized);
  }
  return found;
}

const FULLY_MASKED = '6•• •• •• ••';

/** Masks every phone number in a text except the allowed ones (the member's own). */
export function maskPhonesInText(text: string, allowedE164: readonly string[]): string {
  const { folded, starts, ends } = foldDigits(text);
  let out = '';
  let copiedTo = 0;
  for (const match of folded.matchAll(PHONE_PATTERN)) {
    const normalized = normalizeCameroonPhone(match[0]);
    if (normalized && allowedE164.includes(normalized)) continue;
    const from = starts[match.index] ?? 0;
    const to = ends[match.index + match[0].length - 1] ?? from;
    out += text.slice(copiedTo, from) + FULLY_MASKED;
    copiedTo = to;
  }
  return out + text.slice(copiedTo);
}

/**
 * The text with each phone number replaced by what `replace` returns for it (its E.164 form);
 * `null` keeps the number as written. Numbers are found as maskPhonesInText finds them.
 */
export function replacePhonesInText(
  text: string,
  replace: (e164: string) => string | null,
): string {
  const { folded, starts, ends } = foldDigits(text);
  let out = '';
  let copiedTo = 0;
  for (const match of folded.matchAll(PHONE_PATTERN)) {
    const normalized = normalizeCameroonPhone(match[0]);
    const replacement = normalized ? replace(normalized) : FULLY_MASKED;
    if (replacement === null) continue;
    const from = starts[match.index] ?? 0;
    const to = ends[match.index + match[0].length - 1] ?? from;
    out += text.slice(copiedTo, from) + replacement;
    copiedTo = to;
  }
  return out + text.slice(copiedTo);
}

/** Up to three characters that are neither letters nor digits, between two digits. */
const DIGIT_SEPARATORS = /(?<=\d)[^\p{L}\p{N}]{1,3}(?=\d)/gu;
const NATIONAL_MOBILE = /6\d{8}/;

// A valid calendar date, optionally followed by a two-digit time, such as "16/11/2026 18:00".
// Joined into one digit chain it reaches twelve digits and can contain "6" plus eight digits,
// so it is set aside before the digits are joined. Only real dates qualify: day 1-31, month
// 1-12, year 2024-2035, hour 00-23, minute 00-59.
const DAY = '(?:0?[1-9]|[12]\\d|3[01])';
const MONTH = '(?:0?[1-9]|1[0-2])';
const YEAR = '20(?:2[4-9]|3[0-5])';
const CLOCK = '(?:[01]\\d|2[0-3])[:hH][0-5]\\d';
const DATE_WITH_TIME = new RegExp(
  `(?:${DAY}[/.\\-]${MONTH}[/.\\-]${YEAR}|${YEAR}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01]))(?:[ T]+${CLOCK})?(?!\\d)`,
  'giu',
);
/** Digits directly before a position, possibly through up to three separators (a list comma does not count). */
const DIGIT_CHAIN_BEFORE = /\d[^\p{L}\p{N},;]{0,3}$/u;
/** The start of a number just before a position, joined across any separators, commas included. */
const NUMBER_START_BEFORE = /6\d{2,7}[^\p{L}\p{N}]{0,3}$/u;
/** Eight or more digits right after a position, through up to three separators between them. */
const NUMBER_BODY_AFTER = /^[^\p{L}\p{N}]{0,3}\d(?:[^\p{L}\p{N}]{0,3}\d){7}/u;

/** True when the digits just before a position run into it as part of one number. */
function continuesNumber(before: string): boolean {
  return (
    DIGIT_CHAIN_BEFORE.test(before) ||
    NUMBER_START_BEFORE.test(before.replace(DIGIT_SEPARATORS, ''))
  );
}

/**
 * Replaces each date by a letter, which ends a digit chain, unless a number could run into it:
 * digits before it that continue into the date ("677 123 45, 6/11/2026": the 6 may end a number),
 * or the body of a number right after it ("16/11/2026, 77 12 34 56": the 6 of 2026 may start one).
 */
function setAsideDates(text: string): string {
  return text.replace(DATE_WITH_TIME, (match: string, offset: number) =>
    continuesNumber(text.slice(0, offset)) ||
    NUMBER_BODY_AFTER.test(text.slice(offset + match.length))
      ? match
      : 'x',
  );
}

/** The text with ordinary dates (and their times) set aside, so they are never read as a number. */
export function withoutDates(text: string): string {
  return setAsideDates(text.replace(/\p{Cf}/gu, ''));
}

/**
 * Strict check for member-visible text (names, reasons, notes, corrections; spec 2.11): true when
 * the text carries a Cameroon mobile number in any disguise. Digits of any script are folded,
 * invisible format characters (zero-width spaces, soft hyphens, joiners, bidi marks) are dropped,
 * and digit groups split by up to three non-letters (dashes of any kind, slashes, underscores,
 * dots, brackets, spaces) are joined before looking for `6XXXXXXXX` (also inside `2376XXXXXXXX`).
 * Unlike `findPhoneNumbers` it does not say which number, and it errs on the side of refusing.
 */
export function looksLikePhoneNumber(text: string): boolean {
  const cleaned = foldDigits(text).folded.replace(/\p{Cf}/gu, '');
  return NATIONAL_MOBILE.test(setAsideDates(cleaned).replace(DIGIT_SEPARATORS, ''));
}
