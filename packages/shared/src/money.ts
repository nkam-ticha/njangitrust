import type { Lang } from './lang';

/** Narrow no-break space, the French thousands separator. */
export const NNBSP = ' ';
/** No-break space, keeps the amount and "FCFA" on one line. */
export const NBSP = ' ';
const MINUS = '−';

export interface FormatOptions {
  /** `auto`: minus sign only. `always`: also a plus sign on positive amounts (ledger rows). */
  sign?: 'auto' | 'always';
}

function assertFcfa(amount: number): void {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`Amounts are whole francs CFA; got ${amount}`);
  }
}

function group(digits: string, separator: string): string {
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += separator;
    out += digits[i];
  }
  return out;
}

/**
 * An amount without the currency: `100 000` (fr) or `100,000` (en).
 * Implemented without Intl so every device prints the same thing (spec 1.5).
 */
export function formatAmount(amount: number, lang: Lang, options: FormatOptions = {}): string {
  assertFcfa(amount);
  const sign = amount < 0 ? MINUS : amount > 0 && options.sign === 'always' ? '+' : '';
  const digits = String(Math.abs(amount));
  return sign + group(digits, lang === 'fr' ? NNBSP : ',');
}

/** The only way to show money to a user: `10 000 FCFA` (fr) or `10,000 FCFA` (en). */
export function formatXAF(amount: number, lang: Lang, options: FormatOptions = {}): string {
  return `${formatAmount(amount, lang, options)}${NBSP}FCFA`;
}
