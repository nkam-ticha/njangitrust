// What members still hold in a group (D28): a debt to pay, a live loan, a non-zero balance. A group
// is closed, or an account deleted, only when nobody holds anything. Pure: counts in, a verdict out.
import { describe, expect, it } from 'vitest';
import { holdsMoney, isLiveLoan, LIVE_LOAN_STATUSES, nonZeroBalanceCount } from './holdings';

const none = { obligations: 0, loans: 0, balances: 0 };

describe('holdsMoney', () => {
  it('is false when nothing is held', () => {
    expect(holdsMoney(none)).toBe(false);
  });

  it('is true for a debt still due', () => {
    expect(holdsMoney({ ...none, obligations: 1 })).toBe(true);
  });

  it('is true for a live loan', () => {
    expect(holdsMoney({ ...none, loans: 1 })).toBe(true);
  });

  it('is true for a balance that is not zero', () => {
    expect(holdsMoney({ ...none, balances: 1 })).toBe(true);
  });

  it('is true when several kinds are held, whatever the sizes', () => {
    expect(holdsMoney({ obligations: 3, loans: 2, balances: 7 })).toBe(true);
  });

  it('refuses counts that are not whole, not safe or negative', () => {
    expect(() => holdsMoney({ ...none, obligations: 1.5 })).toThrow(RangeError);
    expect(() => holdsMoney({ ...none, loans: -1 })).toThrow(RangeError);
    expect(() => holdsMoney({ ...none, balances: Number.NaN })).toThrow(RangeError);
    expect(() => holdsMoney({ ...none, balances: Number.MAX_SAFE_INTEGER + 1 })).toThrow(
      RangeError,
    );
  });
});

describe('isLiveLoan and the live statuses', () => {
  it('counts a loan that was asked for, approved, disbursed or is overdue', () => {
    for (const status of ['REQUESTED', 'APPROVED', 'DISBURSED', 'OVERDUE']) {
      expect(isLiveLoan(status), status).toBe(true);
    }
    expect([...LIVE_LOAN_STATUSES]).toEqual(['REQUESTED', 'APPROVED', 'DISBURSED', 'OVERDUE']);
  });

  it('does not count a loan that is over or never started', () => {
    for (const status of ['REJECTED', 'REPAID', 'EXPIRED', 'REFUNDED', 'UNKNOWN', '']) {
      expect(isLiveLoan(status), status).toBe(false);
    }
  });
});

describe('nonZeroBalanceCount', () => {
  it('counts the accounts whose balance is not zero, of either sign', () => {
    expect(
      nonZeroBalanceCount([
        { account: 'payable:member:a', amount: 10_000 },
        { account: 'receivable:member:a', amount: -2_500 },
        { account: 'payable:member:b', amount: 0 },
      ]),
    ).toBe(2);
  });

  it('is zero when every account is settled, or there is none', () => {
    expect(nonZeroBalanceCount([])).toBe(0);
    expect(nonZeroBalanceCount([{ account: 'payable:member:a', amount: 0 }])).toBe(0);
  });

  it('treats an account with no sum (nothing posted) as settled', () => {
    expect(nonZeroBalanceCount([{ account: 'payable:member:a', amount: null }])).toBe(0);
  });

  it('refuses an amount that is not a whole number of francs', () => {
    expect(() => nonZeroBalanceCount([{ account: 'payable:member:a', amount: 0.5 }])).toThrow(
      RangeError,
    );
    expect(() =>
      nonZeroBalanceCount([{ account: 'payable:member:a', amount: Number.NaN }]),
    ).toThrow(RangeError);
  });
});
