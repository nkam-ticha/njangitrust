// The loan limit factor as people read and type it (3.2 loanLimitFactor, stored as
// loanLimitFactorPermille). String arithmetic only: no floating point.

import type { Refusal } from '../result';

/** 3.2: 1500 → "1,5" (fr) or "1.5" (en); trailing zeros dropped. */
export function formatLimitFactor(permille: number, lang: 'fr' | 'en'): string {
  if (!Number.isSafeInteger(permille) || permille < 0) {
    throw new RangeError('the factor is a whole, non-negative number of permille');
  }
  const units = (permille - (permille % 1000)) / 1000;
  const decimals = String(permille % 1000)
    .padStart(3, '0')
    .replace(/0+$/, '');
  return decimals ? `${units}${lang === 'fr' ? ',' : '.'}${decimals}` : String(units);
}

/**
 * 3.2, R11.7: reads a typed factor ("1,5", "1.5", "2") into permille. At most three decimals.
 * The allowed range (0 to 3000) is checked by validateRuleChange.
 */
export function parseLimitFactor(
  input: string,
): { ok: true; permille: number } | Refusal<'INVALID_FACTOR'> {
  const match = /^(\d*)(?:[.,](\d{1,3}))?$/.exec(input.trim());
  if (!match || (match[1] === '' && match[2] === undefined))
    return { ok: false, code: 'INVALID_FACTOR' };
  const units = match[1] === '' ? 0 : Number(match[1]);
  const decimals = Number((match[2] ?? '').padEnd(3, '0'));
  const permille = units * 1000 + decimals;
  return Number.isSafeInteger(permille)
    ? { ok: true, permille }
    : { ok: false, code: 'INVALID_FACTOR' };
}
