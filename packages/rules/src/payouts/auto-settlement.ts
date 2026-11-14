// Auto-settlement (R5.3, R8.5, R12.3 step 3): due debts are paid from the member's payable first.

import { assertNonNegativeFcfa, type Fcfa } from '../money';
import { assertDate } from '../time';

/** A debt to the general fund that auto-settlement may take (spec 2.4 obligations). */
export interface SettleableDebt {
  id: string;
  /**
   * CORRECTION: money already paid out whose payment was reversed (D15 pot corrections, D16.1 and D17
   * clawbacks, D18.3 solidarity shortfalls); due when the correction is posted.
   */
  kind: 'BID' | 'FINE' | 'CORRECTION' | 'LOAN_INSTALLMENT';
  amount: Fcfa;
  /** A winning bid is due at the round's payoutAt; a fine when assessed; an installment at its dueAt. */
  dueAt: Date;
  /**
   * L2: an installment of a loan whose disbursement is still in flight. Never taken: if the send
   * failed, its DISBURSEMENT_RETURNED would leave the receivable below zero. Taken once completed.
   */
  loanInFlight?: boolean;
}

/** R5.3: order between debts due at the same moment. */
const TIE_ORDER: readonly SettleableDebt['kind'][] = [
  'BID',
  'FINE',
  'CORRECTION',
  'LOAN_INSTALLMENT',
];

/**
 * R5.3: at payoutAt and whenever a member's payable is credited (locked or not), the member's due
 * debts are taken from the payable, oldest first (ties: winning bid, fines, corrections, installments).
 * Installments not yet due are never taken. D13.3: debts are taken whole (R3.2), strictly oldest
 * first; at the first one larger than what is left, nothing more is taken, and `uncoveredTotal` (all
 * due debts left) stays unavailable for withdrawal until covered. `total` is the AUTO_SETTLEMENT amount.
 * D18.1: withdrawals in flight have already left the payable, so the ledger balance is what it holds.
 * M1: run it again whenever the payable is credited, a failed withdrawal returned included.
 * L2: installments of a loan still in flight are left out entirely (neither settled nor blocking).
 */
export function autoSettlement(input: {
  payableBalance: Fcfa;
  debts: readonly SettleableDebt[];
  now: Date;
}): {
  settled: SettleableDebt[];
  total: Fcfa;
  remainingPayable: Fcfa;
  notCovered: SettleableDebt[];
  uncoveredTotal: Fcfa;
} {
  assertNonNegativeFcfa(input.payableBalance, 'payableBalance');
  const now = assertDate(input.now, 'now');
  const due = input.debts
    .filter((d) => assertDate(d.dueAt, 'dueAt') <= now && d.loanInFlight !== true)
    .sort((a, b) => {
      const byDate = a.dueAt.getTime() - b.dueAt.getTime();
      if (byDate !== 0) return byDate;
      const byKind = TIE_ORDER.indexOf(a.kind) - TIE_ORDER.indexOf(b.kind);
      return byKind !== 0 ? byKind : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  let remaining = input.payableBalance;
  const settled: SettleableDebt[] = [];
  const notCovered: SettleableDebt[] = [];
  for (const debt of due) {
    assertNonNegativeFcfa(debt.amount, 'debt');
    if (notCovered.length === 0 && debt.amount <= remaining) {
      settled.push(debt);
      remaining -= debt.amount;
    } else {
      notCovered.push(debt);
    }
  }
  return {
    settled,
    total: input.payableBalance - remaining,
    remainingPayable: remaining,
    notCovered,
    uncoveredTotal: notCovered.reduce((sum, d) => sum + d.amount, 0),
  };
}
