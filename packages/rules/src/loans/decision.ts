// Loan decisions (R7.4, R1.2).

import type { Refusal } from '../result';
import { addHours, assertDate } from '../time';

/** R7.4: a request not decided within this many hours expires. */
export const LOAN_REQUEST_EXPIRY_HOURS = 72;

/** Spec 2.4 Loan.status. */
export type LoanStatus =
  'REQUESTED' | 'APPROVED' | 'REJECTED' | 'DISBURSED' | 'REPAID' | 'OVERDUE' | 'EXPIRED';

/** R7.4: the admin decides, except on the admin's own request, which goes to an ADMIN_LOAN vote. */
export function loanDecisionPath(input: {
  borrowerIsAdmin: boolean;
}): 'ADMIN_DECISION' | 'ADMIN_LOAN_VOTE' {
  return input.borrowerIsAdmin ? 'ADMIN_LOAN_VOTE' : 'ADMIN_DECISION';
}

/** R7.4: when an undecided request expires. */
export function loanRequestExpiresAt(requestedAt: Date): Date {
  return addHours(requestedAt, LOAN_REQUEST_EXPIRY_HOURS);
}

/** R7.4: true once a request has gone 72 hours without a decision. */
export function isLoanRequestExpired(requestedAt: Date, now: Date): boolean {
  return assertDate(now, 'now') >= loanRequestExpiresAt(requestedAt).getTime();
}

/**
 * R7.4, R1.2: the admin approves or rejects a pending request with a reason, never their own (that
 * one goes to an ADMIN_LOAN vote), and only within 72 hours.
 */
export function validateLoanDecision(input: {
  deciderMembershipId: string;
  deciderIsAdmin: boolean;
  borrowerMembershipId: string;
  loanStatus: LoanStatus;
  requestedAt: Date;
  reason: string;
  now: Date;
}):
  | { ok: true }
  | Refusal<
      | 'NOT_ADMIN'
      | 'ADMIN_LOAN_REQUIRES_VOTE'
      | 'LOAN_NOT_PENDING'
      | 'LOAN_REQUEST_EXPIRED'
      | 'REASON_REQUIRED'
    > {
  if (!input.deciderIsAdmin) return { ok: false, code: 'NOT_ADMIN' };
  if (input.deciderMembershipId === input.borrowerMembershipId) {
    return { ok: false, code: 'ADMIN_LOAN_REQUIRES_VOTE' };
  }
  if (input.loanStatus !== 'REQUESTED') return { ok: false, code: 'LOAN_NOT_PENDING' };
  if (isLoanRequestExpired(input.requestedAt, input.now))
    return { ok: false, code: 'LOAN_REQUEST_EXPIRED' };
  if (input.reason.trim().length === 0) return { ok: false, code: 'REASON_REQUIRED' };
  return { ok: true };
}
