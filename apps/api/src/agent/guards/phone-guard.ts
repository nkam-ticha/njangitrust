// Output guard (spec 4.8 point 5): masks every phone number that is not one of the allowed numbers
// (the member's own). Two passes: the shared helper for the spec's pattern (any script's digits),
// then a pass for disguised numbers, as in `looksLikePhoneNumber`: digit groups joined across up to
// three non-letters ("6-7-7/12…", "677 12.34_56"), with invisible characters ignored and dates
// such as "16/11/2026 12:00" left alone.
import { looksLikePhoneNumber, maskPhonesInText, normalizeCameroonPhone } from '@njangi/shared';

const MASK = '6•• •• •• ••';
const DIGIT = /\p{Nd}/u;
const LETTER = /\p{L}/u;
const INVISIBLE = /\p{Cf}/u;
const MAX_GAP = 3;
const NATIONAL_MOBILE = /6\d{8}/;

/** The value of any Unicode decimal digit (each script's digits are a run of ten from its zero). */
function digitValue(char: string): string {
  const folded = char.normalize('NFKC');
  if (/^[0-9]$/.test(folded)) return folded;
  const cp = char.codePointAt(0) ?? 0;
  let start = cp;
  while (cp - start < 60 && DIGIT.test(String.fromCodePoint(start - 1))) start -= 1;
  return String((cp - start) % 10);
}

interface Cluster {
  from: number;
  to: number;
  digits: string;
}

/** Maximal runs of digits joined by at most three non-letter characters (invisible ones free). */
function digitClusters(text: string): Cluster[] {
  const chars = Array.from(text);
  const clusters: Cluster[] = [];
  let offset = 0;
  let current: Cluster | null = null;
  let gap = 0;
  for (const char of chars) {
    const at = offset;
    offset += char.length;
    if (DIGIT.test(char)) {
      if (current && gap <= MAX_GAP) {
        current.digits += digitValue(char);
        current.to = offset;
      } else {
        if (current) clusters.push(current);
        current = { from: at, to: offset, digits: digitValue(char) };
      }
      gap = 0;
    } else if (INVISIBLE.test(char)) {
      continue;
    } else if (LETTER.test(char)) {
      if (current) clusters.push(current);
      current = null;
      gap = 0;
    } else if (current) {
      gap += 1;
      if (gap > MAX_GAP) {
        clusters.push(current);
        current = null;
      }
    }
  }
  if (current) clusters.push(current);
  return clusters;
}

function isAllowed(digits: string, allowed: readonly string[]): boolean {
  const normalized = normalizeCameroonPhone(digits);
  return normalized !== null && allowed.includes(normalized);
}

/** Masks every phone number except the `allowed` E.164 numbers, in any spelling or disguise. */
export function maskForeignPhones(text: string, allowed: readonly string[] = []): string {
  const first = maskPhonesInText(text, allowed);
  let out = '';
  let copied = 0;
  for (const cluster of digitClusters(first)) {
    if (!NATIONAL_MOBILE.test(cluster.digits) || isAllowed(cluster.digits, allowed)) continue;
    // Dates and times ("16/11/2026 12:00") are not numbers: the shared strict check knows them.
    if (!looksLikePhoneNumber(first.slice(cluster.from, cluster.to))) continue;
    out += first.slice(copied, cluster.from) + MASK;
    copied = cluster.to;
  }
  return out + first.slice(copied);
}

/** True when the text still carries a phone number outside `allowed`. */
export function hasForeignPhone(text: string, allowed: readonly string[] = []): boolean {
  return maskForeignPhones(text, allowed) !== text;
}

/** The same masking applied to every string of a JSON-like value (tool results, arguments). */
export function maskPhonesDeep<T>(value: T, allowed: readonly string[] = []): T {
  if (typeof value === 'string') return maskForeignPhones(value, allowed) as T;
  if (typeof value === 'number') {
    return (/^(237)?6\d{8}$/.test(String(value)) ? MASK : value) as T;
  }
  if (Array.isArray(value)) return value.map((item: unknown) => maskPhonesDeep(item, allowed)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, maskPhonesDeep(inner, allowed)]),
    ) as T;
  }
  return value;
}
