import { describe, expect, it } from 'vitest';
import { MOCK_FEE_SCHEDULE } from '../fees';
import { validateWithdrawal } from './withdrawal';

const payoutAt = new Date('2026-11-28T17:00:00.000Z');
const now = new Date('2026-11-28T18:00:00.000Z');

const base = {
  payableBalance: 81_340,
  credits: [{ amount: 99_090, payoutAt }],
  feeSchedule: MOCK_FEE_SCHEDULE,
  now,
  hold: null,
  reconciliationStatus: 'OK' as const,
  withdrawalInProgress: false,
  hasActivePaymentNumber: true,
};

describe('withdrawals (R5.4, R5.5)', () => {
  it('E5: "withdraw all" gives 80 840 with the 500 fee estimate', () => {
    expect(validateWithdrawal({ ...base, amount: 'ALL' })).toEqual({
      ok: true,
      amount: 80_840,
      feeEstimate: 500,
      available: 80_840,
    });
  });

  it('allows any partial amount from 100 FCFA up to what is available', () => {
    expect(validateWithdrawal({ ...base, amount: 100 })).toMatchObject({ ok: true, amount: 100 });
    expect(validateWithdrawal({ ...base, amount: 99 })).toEqual({
      ok: false,
      code: 'BELOW_MINIMUM_WITHDRAWAL',
      minimum: 100,
    });
    expect(validateWithdrawal({ ...base, amount: 80_841 })).toEqual({
      ok: false,
      code: 'ABOVE_AVAILABLE',
      available: 80_840,
    });
    expect(validateWithdrawal({ ...base, amount: 50.5 })).toEqual({
      ok: false,
      code: 'INVALID_AMOUNT',
    });
  });

  it('keeps credits locked until the round’s payout time (R5.2)', () => {
    const before = new Date('2026-11-28T16:59:59.999Z');
    expect(
      validateWithdrawal({ ...base, payableBalance: 99_090, now: before, amount: 'ALL' }),
    ).toEqual({
      ok: false,
      code: 'NOTHING_TO_WITHDRAW',
      available: 0,
      locked: 99_090,
      unlocksAt: payoutAt,
    });
  });

  it('refuses during a number-change or PIN-reset hold, saying until when', () => {
    const until = new Date('2026-11-30T10:00:00.000Z');
    expect(
      validateWithdrawal({ ...base, amount: 1_000, hold: { reason: 'NUMBER_CHANGE', until } }),
    ).toEqual({
      ok: false,
      code: 'WITHDRAWAL_HOLD_ACTIVE',
      reason: 'NUMBER_CHANGE',
      until,
    });
  });

  it('pauses every withdrawal while reconciliation is in ALERT', () => {
    expect(validateWithdrawal({ ...base, amount: 1_000, reconciliationStatus: 'ALERT' })).toEqual({
      ok: false,
      code: 'WITHDRAWALS_PAUSED',
    });
    expect(
      validateWithdrawal({ ...base, amount: 1_000, reconciliationStatus: 'WARNING' }),
    ).toMatchObject({ ok: true });
  });

  it('allows one withdrawal at a time, only to an active payment number', () => {
    expect(validateWithdrawal({ ...base, amount: 1_000, withdrawalInProgress: true })).toEqual({
      ok: false,
      code: 'WITHDRAWAL_IN_PROGRESS',
    });
    expect(validateWithdrawal({ ...base, amount: 1_000, hasActivePaymentNumber: false })).toEqual({
      ok: false,
      code: 'NO_ACTIVE_PAYMENT_NUMBER',
    });
  });

  it('says nothing is available when the payable cannot cover 100 FCFA plus the fee', () => {
    expect(validateWithdrawal({ ...base, payableBalance: 599, amount: 'ALL' })).toEqual({
      ok: false,
      code: 'NOTHING_TO_WITHDRAW',
      available: 99,
      locked: 0,
      unlocksAt: null,
    });
  });
});
