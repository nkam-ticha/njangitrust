// Withdrawals (R5.4, R5.5, R4.3, R13.5, D13.3, spec 2.5 "Available to withdraw").

import { scheduleFee, type FeeSchedule } from '../fees';
import { availableToWithdraw, type PayoutCredit } from '../ledger';
import type { Fcfa } from '../money';
import type { Refusal } from '../result';
import type { HoldReason } from '../time';
import type { SettleableDebt } from './auto-settlement';
import { HOLD_APPLIES_TO, validateDisbursement, type DisbursementRefusal } from './disbursement';

/** R5.4: the smallest withdrawal (D11: withdrawals only). */
export const MIN_WITHDRAWAL = 100;

export type WithdrawalRefusal =
  | DisbursementRefusal
  | Refusal<'WITHDRAWAL_IN_PROGRESS'>
  | Refusal<'INVALID_AMOUNT'>
  | Refusal<'NOTHING_TO_WITHDRAW', { available: Fcfa; locked: Fcfa; unlocksAt: Date | null }>
  | Refusal<'BELOW_MINIMUM_WITHDRAWAL', { minimum: Fcfa }>
  | Refusal<'ABOVE_AVAILABLE', { available: Fcfa }>;

/**
 * R5.4, R5.5: checks a withdrawal by the member to their own active number: no disbursement block
 * (validateDisbursement), one at a time, from 100 FCFA up to what is available (availableToWithdraw,
 * the single definition: every due unsettled debt is held back, M1). `amount: 'ALL'` withdraws
 * everything available. On success the service posts DISBURSEMENT_SENT (D18.1).
 */
export function validateWithdrawal(input: {
  amount: Fcfa | 'ALL';
  payableBalance: Fcfa;
  credits: readonly PayoutCredit[];
  feeSchedule: FeeSchedule;
  now: Date;
  /** From activeHold (R13.5); null when no hold applies. */
  hold: { reason: HoldReason; until: Date } | null;
  reconciliationStatus: 'OK' | 'WARNING' | 'ALERT' | null;
  withdrawalInProgress: boolean;
  hasActivePaymentNumber: boolean;
  /** D13.3, M1: the member's unsettled debts; those due at `now` are held back. */
  debts: readonly SettleableDebt[];
}): { ok: true; amount: Fcfa; feeEstimate: Fcfa; available: Fcfa } | WithdrawalRefusal {
  const blocked = validateDisbursement({
    hold: input.hold,
    holdApplies: HOLD_APPLIES_TO.WITHDRAWAL,
    reconciliationStatus: input.reconciliationStatus,
    hasActivePaymentNumber: input.hasActivePaymentNumber,
  });
  if (!blocked.ok) return blocked;
  if (input.withdrawalInProgress) return { ok: false, code: 'WITHDRAWAL_IN_PROGRESS' };
  if (input.amount !== 'ALL' && (!Number.isSafeInteger(input.amount) || input.amount <= 0)) {
    return { ok: false, code: 'INVALID_AMOUNT' };
  }
  const { available, spendable, locked, unlocksAt } = availableToWithdraw({
    payableBalance: input.payableBalance,
    credits: input.credits,
    now: input.now,
    feeSchedule: input.feeSchedule,
    debts: input.debts,
  });
  if (available < MIN_WITHDRAWAL) {
    return { ok: false, code: 'NOTHING_TO_WITHDRAW', available, locked, unlocksAt };
  }
  const amount = input.amount === 'ALL' ? available : input.amount;
  if (amount < MIN_WITHDRAWAL) {
    return { ok: false, code: 'BELOW_MINIMUM_WITHDRAWAL', minimum: MIN_WITHDRAWAL };
  }
  const feeEstimate = scheduleFee(input.feeSchedule, 'DISBURSEMENT', amount);
  if (amount + feeEstimate > spendable) return { ok: false, code: 'ABOVE_AVAILABLE', available };
  return { ok: true, amount, feeEstimate, available };
}
