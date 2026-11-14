import { describe, expect, it } from 'vitest';
import { MOCK_FEE_SCHEDULE } from '../fees';
import { validateSolidarityDisbursement, validateSolidarityRequest } from './solidarity';

const base = {
  event: 'NAISSANCE' as const,
  solidarityFundBalance: 30_000,
  pendingSolidarityPayouts: 0,
  feeSchedule: MOCK_FEE_SCHEDULE,
  recipientIsMember: true,
};

describe('solidarity requests (R10.2, R10.3)', () => {
  it('accepts an amount up to the fund balance; the recipient bears the fee', () => {
    expect(validateSolidarityRequest({ ...base, amount: 20_000 })).toEqual({
      ok: true,
      amount: 20_000,
      feeEstimate: 500,
      recipientReceives: 19_500,
    });
    expect(validateSolidarityRequest({ ...base, amount: 30_000 })).toMatchObject({ ok: true });
  });

  it('refuses more than the fund holds, counting payouts already voted and in progress', () => {
    expect(validateSolidarityRequest({ ...base, amount: 30_001 })).toEqual({
      ok: false,
      code: 'ABOVE_SOLIDARITY_FUND',
      balance: 30_000,
    });
    expect(
      validateSolidarityRequest({ ...base, amount: 20_000, pendingSolidarityPayouts: 15_000 }),
    ).toEqual({
      ok: false,
      code: 'ABOVE_SOLIDARITY_FUND',
      balance: 15_000,
    });
  });

  it('refuses unknown events, non-members, bad amounts and amounts not above the fee', () => {
    expect(validateSolidarityRequest({ ...base, event: 'VOYAGE' as never, amount: 5_000 })).toEqual(
      {
        ok: false,
        code: 'UNKNOWN_EVENT',
      },
    );
    expect(validateSolidarityRequest({ ...base, recipientIsMember: false, amount: 5_000 })).toEqual(
      {
        ok: false,
        code: 'RECIPIENT_NOT_MEMBER',
      },
    );
    expect(validateSolidarityRequest({ ...base, amount: 0 })).toEqual({
      ok: false,
      code: 'INVALID_AMOUNT',
    });
    expect(validateSolidarityRequest({ ...base, amount: 500 })).toEqual({
      ok: false,
      code: 'AMOUNT_NOT_ABOVE_FEE',
      feeEstimate: 500,
    });
    // D11: no 100 FCFA floor; 501 leaves the recipient 1 FCFA after the 500 fee.
    expect(validateSolidarityRequest({ ...base, amount: 501 })).toMatchObject({
      ok: true,
      recipientReceives: 1,
    });
  });
});

describe('sending a passed solidarity payout (R10.3, D13.5)', () => {
  const ready = {
    amount: 20_000,
    solidarityFundBalance: 30_000,
    feeEstimate: 500,
    hold: null,
    reconciliationStatus: 'OK' as const,
    hasActivePaymentNumber: true,
  };

  it('sends it when nothing blocks it and the fund still holds the amount', () => {
    expect(validateSolidarityDisbursement(ready)).toEqual({ ok: true });
  });

  it('waits for the recipient’s number-change hold (D13.5) and for a reconciliation ALERT', () => {
    const until = new Date('2026-11-30T10:00:00.000Z');
    expect(
      validateSolidarityDisbursement({ ...ready, hold: { reason: 'NUMBER_CHANGE', until } }),
    ).toMatchObject({
      ok: false,
      code: 'HOLD_ACTIVE',
    });
    expect(
      validateSolidarityDisbursement({ ...ready, reconciliationStatus: 'ALERT' }),
    ).toMatchObject({
      code: 'DISBURSEMENTS_PAUSED',
    });
  });

  it('re-checks the fund balance and the fee', () => {
    expect(validateSolidarityDisbursement({ ...ready, solidarityFundBalance: 19_999 })).toEqual({
      ok: false,
      code: 'ABOVE_SOLIDARITY_FUND',
      balance: 19_999,
    });
    expect(validateSolidarityDisbursement({ ...ready, amount: 500 })).toMatchObject({
      code: 'AMOUNT_NOT_ABOVE_FEE',
    });
  });
});
