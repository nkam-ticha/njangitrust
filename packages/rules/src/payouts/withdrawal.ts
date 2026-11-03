// Withdrawals (R5.4, R5.5, R4.3, R13.5, spec 2.5 "Available to withdraw").

import { maxAmountWithinFee, scheduleFee, type FeeSchedule } from '../fees';
import type { PayoutCredit } from '../ledger';
import { assertNonNegativeFcfa, type Fcfa } from '../money';
import type { Refusal } from '../result';
import { assertDate, type HoldReason } from '../time';

/** R5.4: the smallest withdrawal. */
export const MIN_WITHDRAWAL = 100;

export type WithdrawalRefusal =
  | Refusal<'WITHDRAWALS_PAUSED'>
  | Refusal<'WITHDRAWAL_HOLD_ACTIVE', { reason: HoldReason; until: Date }>
  | Refusal<'NO_ACTIVE_PAYMENT_NUMBER'>
  | Refusal<'WITHDRAWAL_IN_PROGRESS'>
  | Refusal<'INVALID_AMOUNT'>
  | Refusal<'NOTHING_TO_WITHDRAW', { available: Fcfa; locked: Fcfa; unlocksAt: Date | null }>
  | Refusal<'BELOW_MINIMUM_WITHDRAWAL', { minimum: Fcfa }>
  | Refusal<'ABOVE_AVAILABLE', { available: Fcfa }>;

/**
 * R5.4, R5.5: checks a withdrawal by the member to their own active number: not while
 * reconciliation is in ALERT or a hold (R13.5) is active, one at a time, from 100 FCFA up to what is
 * available. Available = payable − credits locked until their payout time (R5.2), less the estimated
 * disbursement fee (R4.3). `amount: 'ALL'` withdraws everything available.
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
}): { ok: true; amount: Fcfa; feeEstimate: Fcfa; available: Fcfa } | WithdrawalRefusal {
  if (input.reconciliationStatus === 'ALERT') return { ok: false, code: 'WITHDRAWALS_PAUSED' };
  if (input.hold)
    return {
      ok: false,
      code: 'WITHDRAWAL_HOLD_ACTIVE',
      reason: input.hold.reason,
      until: input.hold.until,
    };
  if (!input.hasActivePaymentNumber) return { ok: false, code: 'NO_ACTIVE_PAYMENT_NUMBER' };
  if (input.withdrawalInProgress) return { ok: false, code: 'WITHDRAWAL_IN_PROGRESS' };
  if (input.amount !== 'ALL' && (!Number.isSafeInteger(input.amount) || input.amount <= 0)) {
    return { ok: false, code: 'INVALID_AMOUNT' };
  }
  assertNonNegativeFcfa(input.payableBalance, 'payableBalance');
  const now = assertDate(input.now, 'now');
  let pending = 0;
  let unlocksAt: Date | null = null;
  for (const credit of input.credits) {
    if (assertDate(credit.payoutAt, 'payoutAt') > now) {
      pending += credit.amount;
      if (!unlocksAt || credit.payoutAt.getTime() < unlocksAt.getTime())
        unlocksAt = credit.payoutAt;
    }
  }
  const locked = Math.min(pending, input.payableBalance);
  const spendable = input.payableBalance - locked;
  const available = maxAmountWithinFee(spendable, input.feeSchedule);
  if (available < MIN_WITHDRAWAL) {
    return {
      ok: false,
      code: 'NOTHING_TO_WITHDRAW',
      available,
      locked,
      unlocksAt: locked > 0 ? unlocksAt : null,
    };
  }
  const amount = input.amount === 'ALL' ? available : input.amount;
  if (amount < MIN_WITHDRAWAL)
    return { ok: false, code: 'BELOW_MINIMUM_WITHDRAWAL', minimum: MIN_WITHDRAWAL };
  const feeEstimate = scheduleFee(input.feeSchedule, 'DISBURSEMENT', amount);
  if (amount + feeEstimate > spendable) return { ok: false, code: 'ABOVE_AVAILABLE', available };
  return { ok: true, amount, feeEstimate, available };
}
