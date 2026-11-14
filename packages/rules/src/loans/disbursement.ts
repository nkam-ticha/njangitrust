// Sending an approved loan (R7.5, R4.3, R13.5).

import type { Fcfa } from '../money';
import { HOLD_APPLIES_TO, validateDisbursement, type DisbursementRefusal } from '../payouts';
import type { Refusal } from '../result';
import type { HoldReason } from '../time';
import type { LoanStatus } from './decision';

/**
 * R7.5, R13.5, R4.3: an approved loan is sent to the borrower's payment number only when no
 * disbursement block applies (hold, reconciliation ALERT, no active number) and the principal plus
 * its estimated fee still fit in the money available for loans.
 */
export function validateLoanDisbursement(input: {
  loanStatus: LoanStatus;
  principal: Fcfa;
  feeEstimate: Fcfa;
  availableForLoans: Fcfa;
  hold: { reason: HoldReason; until: Date } | null;
  reconciliationStatus: 'OK' | 'WARNING' | 'ALERT' | null;
  hasActivePaymentNumber: boolean;
}):
  | { ok: true }
  | DisbursementRefusal
  | Refusal<'LOAN_NOT_APPROVED'>
  | Refusal<'LOAN_ABOVE_AVAILABLE_FUNDS', { availableForLoans: Fcfa }> {
  if (input.loanStatus !== 'APPROVED') return { ok: false, code: 'LOAN_NOT_APPROVED' };
  const blocked = validateDisbursement({
    hold: input.hold,
    holdApplies: HOLD_APPLIES_TO.LOAN,
    reconciliationStatus: input.reconciliationStatus,
    hasActivePaymentNumber: input.hasActivePaymentNumber,
  });
  if (!blocked.ok) return blocked;
  if (input.principal + input.feeEstimate > input.availableForLoans) {
    return {
      ok: false,
      code: 'LOAN_ABOVE_AVAILABLE_FUNDS',
      availableForLoans: input.availableForLoans,
    };
  }
  return { ok: true };
}
