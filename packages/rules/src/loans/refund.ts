// A completed loan the operator reversed (D22.1, owner decision Q2 of 2026-11-14): what was already
// repaid goes back to the borrower, the unpaid installments are cancelled.

import { assertNonNegativeFcfa, sumFcfa, type Fcfa } from '../money';
import type { Refusal } from '../result';

/** One installment of the loan, as the services load it. */
export interface RefundedLoanInstallment {
  id: string;
  amount: Fcfa;
  status: 'DUE' | 'PAID' | 'SETTLED' | 'CANCELLED';
  /** Spec 2.6 rule 3: a PENDING PaymentIntent covers it. */
  inPendingPayment: boolean;
}

/**
 * Owner Q2: for DISBURSEMENT_REFUNDED of a loan, `paidBack` (installments PAID or SETTLED) is
 * credited back to the borrower's payable (pass it to disbursementRefundedPostings), the receivable
 * is reduced by the rest (`receivableReduction` = totalDue − paidBack, the unpaid installments), and
 * the unpaid installments are cancelled. Refused while an installment payment is pending: its outcome
 * must be known first. `totalDue` is P + I + estimated fee; the installments must add up to it.
 */
export function loanRefundSettlement(input: {
  totalDue: Fcfa;
  installments: readonly RefundedLoanInstallment[];
}):
  | { ok: true; paidBack: Fcfa; receivableReduction: Fcfa; cancelInstallmentIds: string[] }
  | Refusal<'INSTALLMENT_PAYMENT_PENDING', { installmentId: string }> {
  assertNonNegativeFcfa(input.totalDue, 'totalDue');
  for (const i of input.installments) {
    assertNonNegativeFcfa(i.amount, 'installment');
    if (i.status === 'CANCELLED')
      throw new RangeError('a loan with a cancelled installment cannot be refunded');
  }
  if (sumFcfa(input.installments.map((i) => i.amount)) !== input.totalDue)
    throw new RangeError('the installments do not add up to the loan total');
  const pending = input.installments.find((i) => i.status === 'DUE' && i.inPendingPayment);
  if (pending) return { ok: false, code: 'INSTALLMENT_PAYMENT_PENDING', installmentId: pending.id };
  const repaid = input.installments.filter((i) => i.status === 'PAID' || i.status === 'SETTLED');
  const paidBack = sumFcfa(repaid.map((i) => i.amount));
  return {
    ok: true,
    paidBack,
    receivableReduction: input.totalDue - paidBack,
    cancelInstallmentIds: input.installments.filter((i) => i.status === 'DUE').map((i) => i.id),
  };
}
