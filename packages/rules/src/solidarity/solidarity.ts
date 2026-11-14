// Solidarity fund requests (R10.2, R10.3). Payouts pass by a SOLIDARITY_PAYOUT vote (R11.1); the fund
// is never distributed at cycle end (R10.5).

import { scheduleFee, type FeeSchedule } from '../fees';
import { assertNonNegativeFcfa, type Fcfa } from '../money';
import { HOLD_APPLIES_TO, validateDisbursement, type DisbursementRefusal } from '../payouts';
import type { Refusal } from '../result';
import type { HoldReason } from '../time';

/** R10.2: the life events a request can be for. */
export const SOLIDARITY_EVENTS = ['DEUIL', 'NAISSANCE', 'MALADIE', 'MARIAGE', 'AUTRE'] as const;
export type SolidarityEvent = (typeof SOLIDARITY_EVENTS)[number];

/**
 * R10.2, R10.3, R4.3: a request for the requester or another member, for a listed event, of at most
 * the fund's balance (less payouts already passed and not yet completed). The recipient bears the
 * disbursement fee, receiving the amount minus the estimated fee, so the amount must be above the fee
 * (D11: no other minimum).
 */
export function validateSolidarityRequest(input: {
  amount: Fcfa;
  event: SolidarityEvent;
  solidarityFundBalance: Fcfa;
  /** Passed SOLIDARITY_PAYOUT amounts not yet disbursed. */
  pendingSolidarityPayouts: Fcfa;
  feeSchedule: FeeSchedule;
  recipientIsMember: boolean;
}):
  | { ok: true; amount: Fcfa; feeEstimate: Fcfa; recipientReceives: Fcfa }
  | Refusal<'UNKNOWN_EVENT' | 'RECIPIENT_NOT_MEMBER' | 'INVALID_AMOUNT'>
  | Refusal<'ABOVE_SOLIDARITY_FUND', { balance: Fcfa }>
  | Refusal<'AMOUNT_NOT_ABOVE_FEE', { feeEstimate: Fcfa }> {
  if (!SOLIDARITY_EVENTS.includes(input.event)) return { ok: false, code: 'UNKNOWN_EVENT' };
  if (!input.recipientIsMember) return { ok: false, code: 'RECIPIENT_NOT_MEMBER' };
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0)
    return { ok: false, code: 'INVALID_AMOUNT' };
  assertNonNegativeFcfa(input.solidarityFundBalance, 'solidarityFundBalance');
  assertNonNegativeFcfa(input.pendingSolidarityPayouts, 'pendingSolidarityPayouts');
  const balance = Math.max(0, input.solidarityFundBalance - input.pendingSolidarityPayouts);
  if (input.amount > balance) return { ok: false, code: 'ABOVE_SOLIDARITY_FUND', balance };
  const feeEstimate = scheduleFee(input.feeSchedule, 'DISBURSEMENT', input.amount);
  const recipientReceives = input.amount - feeEstimate;
  if (recipientReceives <= 0) return { ok: false, code: 'AMOUNT_NOT_ABOVE_FEE', feeEstimate };
  return { ok: true, amount: input.amount, feeEstimate, recipientReceives };
}

/**
 * R10.3, D13.5: a passed SOLIDARITY_PAYOUT is sent only when no disbursement block applies to the
 * recipient (the number-change hold included) and the fund still holds the amount, above its fee.
 */
export function validateSolidarityDisbursement(input: {
  amount: Fcfa;
  solidarityFundBalance: Fcfa;
  feeEstimate: Fcfa;
  hold: { reason: HoldReason; until: Date } | null;
  reconciliationStatus: 'OK' | 'WARNING' | 'ALERT' | null;
  hasActivePaymentNumber: boolean;
}):
  | { ok: true }
  | DisbursementRefusal
  | Refusal<'ABOVE_SOLIDARITY_FUND', { balance: Fcfa }>
  | Refusal<'AMOUNT_NOT_ABOVE_FEE', { feeEstimate: Fcfa }> {
  const blocked = validateDisbursement({
    hold: input.hold,
    holdApplies: HOLD_APPLIES_TO.SOLIDARITY,
    reconciliationStatus: input.reconciliationStatus,
    hasActivePaymentNumber: input.hasActivePaymentNumber,
  });
  if (!blocked.ok) return blocked;
  if (input.amount > input.solidarityFundBalance) {
    return { ok: false, code: 'ABOVE_SOLIDARITY_FUND', balance: input.solidarityFundBalance };
  }
  if (input.amount <= input.feeEstimate) {
    return { ok: false, code: 'AMOUNT_NOT_ABOVE_FEE', feeEstimate: input.feeEstimate };
  }
  return { ok: true };
}
