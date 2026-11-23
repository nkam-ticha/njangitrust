// Derived values (2.5): what a member can withdraw and what the group can lend.

import { maxAmountWithinFee, type FeeSchedule } from '../fees';
import { dueDebtsTotal } from '../holdings/due-debts';
import { assertNonNegativeFcfa, type Fcfa } from '../money';
import { assertDate } from '../time';
import type { BalanceSummary } from './balances';

type Reserved = Pick<BalanceSummary, 'cash' | 'payables' | 'pots' | 'solidarityFund' | 'inFlight'>;

/**
 * 2.5, R5.6, D18.1: available for loans = cash − all payables − pots − solidarity fund − in-flight
 * disbursements (their in-flight accounts, fees included), floored at zero, so money reserved for
 * members, the solidarity fund or a payout on its way out is never lent.
 */
export function availableForLoans(input: { summary: Reserved }): Fcfa {
  const { cash, payables, pots, solidarityFund, inFlight } = input.summary;
  return Math.max(0, cash - payables - pots - solidarityFund - inFlight);
}

/**
 * D16.2, D18.1, R5.6: by how much provider cash falls short, NOW, of the money reserved for members,
 * round pots, the solidarity fund and disbursements in flight (0 when covered). Coverage is current
 * state, not ledger integrity (H1): above 0 the daily check is ALERT until it is covered again.
 */
export function reservedShortfall(summary: Reserved): Fcfa {
  return Math.max(
    0,
    summary.payables + summary.pots + summary.solidarityFund + summary.inFlight - summary.cash,
  );
}

/** R5.2: a payout credit to a member, locked until its round's payout time. */
export interface PayoutCredit {
  amount: Fcfa;
  payoutAt: Date;
}

/**
 * 2.5, R5.2, R4.3, D13.3, M1: the one definition of "available to withdraw". From the payable (which
 * no longer holds withdrawals in flight, D18.1), take out credits still locked until their round's
 * payout time (never more than the payable holds), then an amount equal to ALL the member's due debts
 * not settled yet (whether or not auto-settlement could take them), so a member never withdraws money
 * they owe; what is left must also pay the estimated disbursement fee, so available is the largest
 * amount that fits with its fee. `spendable` is what amount plus fee must fit in.
 */
export function availableToWithdraw(input: {
  payableBalance: Fcfa;
  credits: readonly PayoutCredit[];
  now: Date;
  feeSchedule: FeeSchedule;
  /** D13.3, M1: the member's unsettled debts (fines, bids, corrections, installments); due ones are held. */
  debts: readonly { amount: Fcfa; dueAt: Date; kind?: string; status?: string }[];
}): { available: Fcfa; spendable: Fcfa; locked: Fcfa; unlocksAt: Date | null; heldForDebts: Fcfa } {
  assertNonNegativeFcfa(input.payableBalance, 'payableBalance');
  const now = assertDate(input.now, 'now');
  const dueDebts = dueDebtsTotal(input.debts, input.now);
  let pending = 0;
  let unlocksAt: Date | null = null;
  for (const credit of input.credits) {
    assertNonNegativeFcfa(credit.amount, 'credit');
    const at = assertDate(credit.payoutAt, 'payoutAt');
    if (at > now) {
      pending += credit.amount;
      if (!unlocksAt || at < unlocksAt.getTime()) unlocksAt = credit.payoutAt;
    }
  }
  const locked = Math.min(pending, input.payableBalance);
  const heldForDebts = Math.min(dueDebts, input.payableBalance - locked);
  const spendable = input.payableBalance - locked - heldForDebts;
  return {
    available: maxAmountWithinFee(spendable, input.feeSchedule),
    spendable,
    locked,
    unlocksAt: locked > 0 ? unlocksAt : null,
    heldForDebts,
  };
}
