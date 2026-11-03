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

/** Every phone number found in a text, normalised to E.164. */
export function findPhoneNumbers(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(PHONE_PATTERN)) {
    const normalized = normalizeCameroonPhone(match[0]);
    if (normalized) found.push(normalized);
  }
  return found;
}

const FULLY_MASKED = '6•• •• •• ••';

/** Masks every phone number in a text except the allowed ones (the member's own). */
export function maskPhonesInText(text: string, allowedE164: readonly string[]): string {
  return text.replace(PHONE_PATTERN, (match) => {
    const normalized = normalizeCameroonPhone(match);
    return normalized && allowedE164.includes(normalized) ? match : FULLY_MASKED;
  });
}
