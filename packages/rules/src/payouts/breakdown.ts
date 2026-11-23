// The payout breakdown a beneficiary sees for their round (CAI-03, FSD Flow B, FEE-03).

import { maxAmountWithinFee, scheduleFee, type FeeSchedule } from '../fees';
import { assertNonNegativeFcfa, sumFcfa, type Fcfa } from '../money';
import type { SettleableDebt } from './auto-settlement';
import { MIN_WITHDRAWAL } from './withdrawal';

export interface PayoutBreakdown {
  /** Gross contributions of the round. */
  collected: Fcfa;
  /** Their collection fee shares, borne by the beneficiary (R4.1). */
  collectionFees: Fcfa;
  credited: Fcfa;
  deductions: { kind: SettleableDebt['kind']; amount: Fcfa }[];
  deductionsTotal: Fcfa;
  withdrawn: Fcfa;
  withdrawalFees: Fcfa;
  remaining: Fcfa;
  /** The most the beneficiary can still receive and its estimated fee, or null below 100 FCFA. */
  nextWithdrawal: { maxAmount: Fcfa; fee: Fcfa } | null;
}

/**
 * CAI-03, FEE-03: collected − collection fees = credited; − deductions taken by auto-settlement
 * (R5.3) − withdrawals and their fees = remaining; and the largest next withdrawal with its fee.
 * Covers this round's money only; "available to withdraw" (availableToWithdraw) stays the rule.
 */
export function payoutBreakdown(input: {
  contributions: readonly { amount: Fcfa; feeShare: Fcfa }[];
  deductions: readonly { kind: SettleableDebt['kind']; amount: Fcfa }[];
  withdrawals: readonly { amount: Fcfa; fee: Fcfa }[];
  feeSchedule: FeeSchedule;
  /**
   * D13.3: the member's due debts that auto-settlement has not taken yet. A withdrawal holds an
   * equal amount back (availableToWithdraw), so the next withdrawal shown here does too. It does
   * not change `remaining`, which is this round's money.
   */
  heldForDebts?: Fcfa;
}): PayoutBreakdown {
  const held = input.heldForDebts ?? 0;
  assertNonNegativeFcfa(held, 'heldForDebts');
  for (const c of input.contributions) {
    assertNonNegativeFcfa(c.amount, 'contribution');
    assertNonNegativeFcfa(c.feeShare, 'feeShare');
    if (c.feeShare > c.amount) throw new RangeError('a fee share cannot exceed its contribution');
  }
  const collected = sumFcfa(input.contributions.map((c) => c.amount));
  const collectionFees = sumFcfa(input.contributions.map((c) => c.feeShare));
  const credited = collected - collectionFees;
  const deductionsTotal = sumFcfa(input.deductions.map((d) => d.amount));
  const withdrawn = sumFcfa(input.withdrawals.map((w) => w.amount));
  const withdrawalFees = sumFcfa(input.withdrawals.map((w) => w.fee));
  const remaining = credited - deductionsTotal - withdrawn - withdrawalFees;
  if (remaining < 0) throw new RangeError('deductions and withdrawals exceed what was credited');
  const maxAmount = maxAmountWithinFee(Math.max(0, remaining - held), input.feeSchedule);
  return {
    collected,
    collectionFees,
    credited,
    deductions: input.deductions.map((d) => ({ kind: d.kind, amount: d.amount })),
    deductionsTotal,
    withdrawn,
    withdrawalFees,
    remaining,
    nextWithdrawal:
      maxAmount >= MIN_WITHDRAWAL
        ? { maxAmount, fee: scheduleFee(input.feeSchedule, 'DISBURSEMENT', maxAmount) }
        : null,
  };
}
