// Auto-settlement (R5.3, R8.5, R12.3 step 3): due debts are paid from the member's payable first.

import { assertNonNegativeFcfa, type Fcfa } from '../money';
import { assertDate } from '../time';

/** A debt to the general fund that auto-settlement may take (spec 2.4 obligations). */
export interface SettleableDebt {
  id: string;
  kind: 'BID' | 'FINE' | 'LOAN_INSTALLMENT';
  amount: Fcfa;
  /** A winning bid is due at the round's payoutAt; a fine when assessed; an installment at its dueAt. */
  dueAt: Date;
}

/** R5.3: order between debts due at the same moment. */
const TIE_ORDER: readonly SettleableDebt['kind'][] = ['BID', 'FINE', 'LOAN_INSTALLMENT'];

/**
 * R5.3: at payoutAt and whenever a member's payable is credited (locked or not), the member's due
 * debts are taken from the payable, oldest first (ties: winning bid, fines, installments).
 * Installments not yet due are never taken. Debts are taken whole, like any obligation (R3.2); one
 * that doesn't fit stays due, and smaller ones after it are still taken. The result's `total` is the
 * AUTO_SETTLEMENT amount.
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
} {
  assertNonNegativeFcfa(input.payableBalance, 'payableBalance');
  const now = assertDate(input.now, 'now');
  const due = input.debts
    .filter((d) => assertDate(d.dueAt, 'dueAt') <= now)
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
    if (debt.amount <= remaining) {
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
  };
}
