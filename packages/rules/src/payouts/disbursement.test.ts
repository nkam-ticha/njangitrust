import { describe, expect, it } from 'vitest';
import { HOLD_APPLIES_TO, validateDisbursement } from './disbursement';

const until = new Date('2026-11-30T10:00:00.000Z');
const clear = {
  hold: null,
  holdApplies: true,
  reconciliationStatus: 'OK' as const,
  hasActivePaymentNumber: true,
};

describe('any disbursement (R5.5, R7.5, R13.5, D13.5)', () => {
  it('passes when nothing blocks it', () => {
    expect(validateDisbursement(clear)).toEqual({ ok: true });
  });

  it('pauses every disbursement while reconciliation is in ALERT, not on a WARNING', () => {
    expect(validateDisbursement({ ...clear, reconciliationStatus: 'ALERT' })).toEqual({
      ok: false,
      code: 'DISBURSEMENTS_PAUSED',
    });
    expect(validateDisbursement({ ...clear, reconciliationStatus: 'WARNING' })).toEqual({
      ok: true,
    });
  });

  it('waits for the number-change or PIN-reset hold when the hold applies', () => {
    const hold = { reason: 'NUMBER_CHANGE' as const, until };
    expect(validateDisbursement({ ...clear, hold })).toEqual({
      ok: false,
      code: 'HOLD_ACTIVE',
      reason: 'NUMBER_CHANGE',
      until,
    });
    expect(validateDisbursement({ ...clear, hold, holdApplies: false })).toEqual({ ok: true });
  });

  it('needs an active payment number', () => {
    expect(validateDisbursement({ ...clear, hasActivePaymentNumber: false })).toEqual({
      ok: false,
      code: 'NO_ACTIVE_PAYMENT_NUMBER',
    });
  });

  it('applies the hold to withdrawals, loan disbursements and solidarity payouts (D13.5)', () => {
    expect(HOLD_APPLIES_TO).toEqual({ WITHDRAWAL: true, LOAN: true, SOLIDARITY: true });
  });
});
