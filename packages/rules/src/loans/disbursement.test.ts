import { describe, expect, it } from 'vitest';
import { validateLoanDisbursement } from './disbursement';

const ready = {
  loanStatus: 'APPROVED' as const,
  principal: 30_000,
  feeEstimate: 500,
  availableForLoans: 40_000,
  hold: null,
  reconciliationStatus: 'OK' as const,
  hasActivePaymentNumber: true,
};

describe('sending an approved loan (R7.5, R4.3, R13.5)', () => {
  it('sends an approved loan that still fits in the money available for loans', () => {
    expect(validateLoanDisbursement(ready)).toEqual({ ok: true });
  });

  it('waits during the borrower’s number-change hold and during a reconciliation ALERT', () => {
    const until = new Date('2026-11-30T10:00:00.000Z');
    expect(
      validateLoanDisbursement({ ...ready, hold: { reason: 'NUMBER_CHANGE', until } }),
    ).toEqual({
      ok: false,
      code: 'HOLD_ACTIVE',
      reason: 'NUMBER_CHANGE',
      until,
    });
    expect(validateLoanDisbursement({ ...ready, reconciliationStatus: 'ALERT' })).toEqual({
      ok: false,
      code: 'DISBURSEMENTS_PAUSED',
    });
  });

  it('re-checks the funds: principal plus estimated fee must fit (the situation may have changed)', () => {
    expect(validateLoanDisbursement({ ...ready, availableForLoans: 30_499 })).toEqual({
      ok: false,
      code: 'LOAN_ABOVE_AVAILABLE_FUNDS',
      availableForLoans: 30_499,
    });
    expect(validateLoanDisbursement({ ...ready, availableForLoans: 30_500 })).toEqual({ ok: true });
  });

  it('sends only approved loans', () => {
    expect(validateLoanDisbursement({ ...ready, loanStatus: 'REQUESTED' })).toEqual({
      ok: false,
      code: 'LOAN_NOT_APPROVED',
    });
  });
});
