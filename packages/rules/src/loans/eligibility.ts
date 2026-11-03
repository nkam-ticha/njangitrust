// Loan eligibility (R7.1) and limit (R7.2).

import { maxAmountWithinFee, type FeeSchedule } from '../fees';
import type { MembershipStatus } from '../membership';
import { assertNonNegativeFcfa, mulDivFloor, sumFcfa, type Fcfa } from '../money';
import type { Refusal } from '../result';
import { assertDate } from '../time';

/** An unpaid debt to the general fund (3.1 "Receivable"). */
export interface UnpaidDebt {
  kind: 'FINE' | 'BID' | 'LOAN_INSTALLMENT';
  amount: Fcfa;
  dueAt: Date;
}

/**
 * R7.1: eligible when the member is active and not leaving, has no active loan (requested,
 * approved, disbursed or overdue) and no overdue debt.
 */
export function loanEligibility(input: {
  membershipStatus: MembershipStatus;
  hasActiveLoan: boolean;
  unpaidDebts: readonly UnpaidDebt[];
  now: Date;
}):
  | { ok: true }
  | Refusal<'NOT_ACTIVE_MEMBER' | 'MEMBER_LEAVING' | 'ACTIVE_LOAN_EXISTS'>
  | Refusal<'OVERDUE_DEBT', { amount: Fcfa }> {
  if (input.membershipStatus === 'LEAVING') return { ok: false, code: 'MEMBER_LEAVING' };
  if (input.membershipStatus !== 'ACTIVE') return { ok: false, code: 'NOT_ACTIVE_MEMBER' };
  if (input.hasActiveLoan) return { ok: false, code: 'ACTIVE_LOAN_EXISTS' };
  const now = assertDate(input.now, 'now');
  const overdue = input.unpaidDebts.filter((d) => assertDate(d.dueAt, 'dueAt') < now);
  if (overdue.length > 0) {
    return { ok: false, code: 'OVERDUE_DEBT', amount: sumFcfa(overdue.map((d) => d.amount)) };
  }
  return { ok: true };
}

/**
 * R7.2, R4.3, 2.5: the loan limit is the smaller of
 * - loanLimitFactor × contributions paid this cycle − principal still outstanding, and
 * - available for loans, keeping room for the estimated disbursement fee so the fee is never paid
 *   from money reserved for members.
 */
export function loanLimit(input: {
  /** loanLimitFactor in permille (1000 = 1.0). */
  loanLimitFactorPermille: number;
  contributionsPaidThisCycle: Fcfa;
  outstandingPrincipal: Fcfa;
  availableForLoans: Fcfa;
  feeSchedule: FeeSchedule;
}): { limit: Fcfa; byContributions: Fcfa; byAvailableFunds: Fcfa } {
  assertNonNegativeFcfa(input.contributionsPaidThisCycle, 'contributionsPaidThisCycle');
  assertNonNegativeFcfa(input.outstandingPrincipal, 'outstandingPrincipal');
  const byContributions = Math.max(
    0,
    mulDivFloor(input.contributionsPaidThisCycle, input.loanLimitFactorPermille, 1000) -
      input.outstandingPrincipal,
  );
  const byAvailableFunds = maxAmountWithinFee(input.availableForLoans, input.feeSchedule);
  return { limit: Math.min(byContributions, byAvailableFunds), byContributions, byAvailableFunds };
}
