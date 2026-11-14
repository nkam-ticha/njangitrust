// What every money-out operation must pass before it is sent (R5.5, R7.5, R13.5, D13.5).

import type { DisbursementPurpose } from '../ledger';
import type { Refusal } from '../result';
import type { HoldReason } from '../time';

/** D13.5: the number-change and PIN-reset hold applies to every kind of disbursement. */
export const HOLD_APPLIES_TO: Readonly<Record<DisbursementPurpose, boolean>> = {
  WITHDRAWAL: true,
  LOAN: true,
  SOLIDARITY: true,
};

export type DisbursementRefusal =
  | Refusal<'DISBURSEMENTS_PAUSED'>
  | Refusal<'HOLD_ACTIVE', { reason: HoldReason; until: Date }>
  | Refusal<'NO_ACTIVE_PAYMENT_NUMBER'>;

/**
 * R5.5, R7.5, R13.5: a disbursement waits while the daily reconciliation is in ALERT, while the
 * recipient's hold is active (when `holdApplies`, see HOLD_APPLIES_TO), and needs the recipient's
 * active payment number.
 */
export function validateDisbursement(input: {
  /** From activeHold (R13.5) for the recipient; null when none. */
  hold: { reason: HoldReason; until: Date } | null;
  holdApplies: boolean;
  reconciliationStatus: 'OK' | 'WARNING' | 'ALERT' | null;
  hasActivePaymentNumber: boolean;
}): { ok: true } | DisbursementRefusal {
  if (input.reconciliationStatus === 'ALERT') return { ok: false, code: 'DISBURSEMENTS_PAUSED' };
  if (input.hold && input.holdApplies) {
    return { ok: false, code: 'HOLD_ACTIVE', reason: input.hold.reason, until: input.hold.until };
  }
  if (!input.hasActivePaymentNumber) return { ok: false, code: 'NO_ACTIVE_PAYMENT_NUMBER' };
  return { ok: true };
}
