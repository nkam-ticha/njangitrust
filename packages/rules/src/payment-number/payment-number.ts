// Payment numbers (R13.1, R13.2, R13.7). The hold after a change is activeHold in time/ (R13.5).

import type { Refusal } from '../result';

export type Operator = 'MTN' | 'ORANGE';

/** R13.1: `+2376XXXXXXXX`, or null when the input is not a 9-digit Cameroon mobile number. */
export function normalizePaymentNumber(input: string): string | null {
  let digits = input.replace(/[\s.\-()]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length === 12 && digits.startsWith('237')) digits = digits.slice(3);
  if (!/^6\d{8}$/.test(digits)) return null;
  return `+237${digits}`;
}

/**
 * R13.1: best guess of the operator from the prefix (MTN 67x, 650–654, 680–684; Orange 69x,
 * 655–659, 640), UNKNOWN otherwise. The member confirms the operator.
 */
export function detectOperator(e164: string): Operator | 'UNKNOWN' {
  if (!/^\+2376\d{8}$/.test(e164)) throw new RangeError('expected a +2376XXXXXXXX number');
  const p2 = Number(e164.slice(4, 6));
  const p3 = Number(e164.slice(4, 7));
  if (p2 === 67 || (p3 >= 650 && p3 <= 654) || (p3 >= 680 && p3 <= 684)) return 'MTN';
  if (p2 === 69 || (p3 >= 655 && p3 <= 659) || p3 === 640) return 'ORANGE';
  return 'UNKNOWN';
}

/**
 * R13.1: a payment number is a Cameroon MTN or Orange mobile number. The operator the member chose is
 * kept unless the prefix clearly belongs to the other operator.
 */
export function validatePaymentNumber(input: {
  input: string;
  operator: Operator;
}):
  | { ok: true; e164: string; operator: Operator }
  | Refusal<'INVALID_PAYMENT_NUMBER'>
  | Refusal<'OPERATOR_MISMATCH', { detected: Operator }> {
  const e164 = normalizePaymentNumber(input.input);
  if (!e164) return { ok: false, code: 'INVALID_PAYMENT_NUMBER' };
  const detected = detectOperator(e164);
  if (detected !== 'UNKNOWN' && detected !== input.operator) {
    return { ok: false, code: 'OPERATOR_MISMATCH', detected };
  }
  return { ok: true, e164, operator: input.operator };
}

/** R13.2, R13.7: only the member can change their own payment number; nobody else, admin included. */
export function canChangePaymentNumber(input: {
  actorUserId: string;
  ownerUserId: string;
}): { ok: true } | Refusal<'ONLY_OWNER_CAN_CHANGE_NUMBER'> {
  return input.actorUserId === input.ownerUserId
    ? { ok: true }
    : { ok: false, code: 'ONLY_OWNER_CAN_CHANGE_NUMBER' };
}
