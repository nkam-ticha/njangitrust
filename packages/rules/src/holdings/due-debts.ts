// Which debts are due, and so withheld from a member's money (D13.3, D18, M1). A single definition
// for every place that needs it: the withdrawal check (what is held back) and the beneficiary's
// "debts due" figure (what is shown), so the two can never disagree. Pure, integers only.

import { assertNonNegativeFcfa, type Fcfa } from '../money';
import { assertDate } from '../time';

/** The kinds of obligation that are debts: a payout withholds them when they fall due (D13.3). */
export const WITHHELD_DEBT_KINDS = ['BID', 'FINE', 'CORRECTION', 'LOAN_INSTALLMENT'] as const;

/** A row that may be a debt. `kind` and `status` are checked only when the row has them. */
export interface DebtLike {
  amount: Fcfa;
  dueAt: Date;
  kind?: string;
  /** Obligation status; only `DUE` is unsettled. */
  status?: string;
}

/**
 * The debts to hold back at `now`: unsettled (`DUE`), one of the four debt kinds (corrections
 * included, D16.1) and due at or before `now`. A loan installment of a loan still being sent counts
 * too: the money is withheld whether or not auto-settlement can take it yet (M1).
 */
export function selectDueDebts<T extends DebtLike>(debts: readonly T[], now: Date): T[] {
  const at = assertDate(now, 'now');
  return debts.filter((debt) => {
    assertNonNegativeFcfa(debt.amount, 'debt');
    if (debt.status !== undefined && debt.status !== 'DUE') return false;
    if (
      debt.kind !== undefined &&
      !(WITHHELD_DEBT_KINDS as readonly string[]).includes(debt.kind)
    ) {
      return false;
    }
    return assertDate(debt.dueAt, 'dueAt') <= at;
  });
}

/** The total of `selectDueDebts`, in whole FCFA. */
export function dueDebtsTotal(debts: readonly DebtLike[], now: Date): Fcfa {
  return selectDueDebts(debts, now).reduce((sum, debt) => sum + debt.amount, 0);
}
