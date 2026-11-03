// Loan repayment, due or early (R7.6, R7.7). Interest is fixed at approval, so repaying early only
// pays the remaining installments sooner; nothing is recomputed.

import { sumFcfa, type Fcfa } from '../money';
import type { Refusal } from '../result';

export interface UnpaidInstallment {
  id: string;
  amount: Fcfa;
  dueAt: Date;
}

function byDueDate(installments: readonly UnpaidInstallment[]): UnpaidInstallment[] {
  return [...installments].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

/** R7.7: what a member can repay now: the next installment, the next two, … up to everything left. */
export function repaymentOptions(
  unpaid: readonly UnpaidInstallment[],
): { installmentIds: string[]; amount: Fcfa }[] {
  const ordered = byDueDate(unpaid);
  return ordered.map((_, i) => {
    const chosen = ordered.slice(0, i + 1);
    return {
      installmentIds: chosen.map((x) => x.id),
      amount: sumFcfa(chosen.map((x) => x.amount)),
    };
  });
}

/**
 * R7.6, R7.7, R3.2: installments are paid whole, oldest first. `NEXT` (the default of repay_loan)
 * is the next installment, `ALL` everything left; an amount must match whole installments.
 */
export function selectInstallmentsForRepayment(
  unpaid: readonly UnpaidInstallment[],
  amount: Fcfa | 'NEXT' | 'ALL',
):
  | { ok: true; installmentIds: string[]; amount: Fcfa }
  | Refusal<'NOTHING_TO_REPAY'>
  | Refusal<'AMOUNT_NOT_WHOLE_INSTALLMENTS', { options: Fcfa[] }> {
  const options = repaymentOptions(unpaid);
  if (options.length === 0) return { ok: false, code: 'NOTHING_TO_REPAY' };
  const pick =
    amount === 'NEXT'
      ? options[0]
      : amount === 'ALL'
        ? options.at(-1)
        : options.find((o) => o.amount === amount);
  if (!pick) {
    return {
      ok: false,
      code: 'AMOUNT_NOT_WHOLE_INSTALLMENTS',
      options: options.map((o) => o.amount),
    };
  }
  return { ok: true, ...pick };
}
