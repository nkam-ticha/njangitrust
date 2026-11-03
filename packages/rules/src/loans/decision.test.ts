import { describe, expect, it } from 'vitest';
import {
  isLoanRequestExpired,
  loanDecisionPath,
  loanRequestExpiresAt,
  validateLoanDecision,
} from './decision';

const requestedAt = new Date('2026-10-31T10:00:00.000Z');

describe('loan decisions (R7.4, R1.2)', () => {
  it('sends an admin’s own request to an ADMIN_LOAN vote', () => {
    expect(loanDecisionPath({ borrowerIsAdmin: true })).toBe('ADMIN_LOAN_VOTE');
    expect(loanDecisionPath({ borrowerIsAdmin: false })).toBe('ADMIN_DECISION');
  });

  it('expires requests not decided within 72 hours', () => {
    expect(loanRequestExpiresAt(requestedAt)).toEqual(new Date('2026-11-03T10:00:00.000Z'));
    expect(isLoanRequestExpired(requestedAt, new Date('2026-11-03T09:59:59.999Z'))).toBe(false);
    expect(isLoanRequestExpired(requestedAt, new Date('2026-11-03T10:00:00.000Z'))).toBe(true);
  });

  const decision = {
    deciderMembershipId: 'ADMIN',
    deciderIsAdmin: true,
    borrowerMembershipId: 'M7',
    loanStatus: 'REQUESTED' as const,
    requestedAt,
    reason: 'Bon historique',
    now: new Date('2026-11-01T10:00:00.000Z'),
  };

  it('lets the admin approve or reject another member’s request with a reason', () => {
    expect(validateLoanDecision(decision)).toEqual({ ok: true });
  });

  it('refuses non-admins, the admin’s own loan, missing reasons, decided and expired requests', () => {
    expect(validateLoanDecision({ ...decision, deciderIsAdmin: false })).toEqual({
      ok: false,
      code: 'NOT_ADMIN',
    });
    expect(validateLoanDecision({ ...decision, borrowerMembershipId: 'ADMIN' })).toEqual({
      ok: false,
      code: 'ADMIN_LOAN_REQUIRES_VOTE',
    });
    expect(validateLoanDecision({ ...decision, reason: '  ' })).toEqual({
      ok: false,
      code: 'REASON_REQUIRED',
    });
    expect(validateLoanDecision({ ...decision, loanStatus: 'APPROVED' })).toEqual({
      ok: false,
      code: 'LOAN_NOT_PENDING',
    });
    expect(
      validateLoanDecision({ ...decision, now: new Date('2026-11-05T10:00:00.000Z') }),
    ).toEqual({
      ok: false,
      code: 'LOAN_REQUEST_EXPIRED',
    });
  });
});
