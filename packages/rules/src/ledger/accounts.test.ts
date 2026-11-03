import { describe, expect, it } from 'vitest';
import {
  CASH_PROVIDER,
  GENERAL_FUND,
  naturalBalance,
  parseAccount,
  payableAccount,
  potAccount,
  receivableAccount,
  SOLIDARITY_FUND,
} from './accounts';

describe('ledger accounts (2.5)', () => {
  it('names the per-group accounts exactly as the spec', () => {
    expect(CASH_PROVIDER).toBe('cash:provider');
    expect(GENERAL_FUND).toBe('fund:general');
    expect(SOLIDARITY_FUND).toBe('fund:solidarity');
    expect(payableAccount('M7')).toBe('payable:member:M7');
    expect(receivableAccount('M5')).toBe('receivable:member:M5');
    expect(potAccount('r5')).toBe('pot:round:r5');
  });

  it('parses account names and refuses unknown ones', () => {
    expect(parseAccount('payable:member:M7')).toEqual({ kind: 'PAYABLE', id: 'M7' });
    expect(parseAccount('receivable:member:M5')).toEqual({ kind: 'RECEIVABLE', id: 'M5' });
    expect(parseAccount('cash:provider')).toEqual({ kind: 'CASH', id: null });
    expect(parseAccount('fund:general')).toEqual({ kind: 'GENERAL_FUND', id: null });
    expect(parseAccount('fund:solidarity')).toEqual({ kind: 'SOLIDARITY_FUND', id: null });
    expect(parseAccount('pot:round:r5')).toEqual({ kind: 'POT', id: 'r5' });
    for (const bad of ['cash', 'payable:member:', 'fund:other', 'payable:group:x', '']) {
      expect(parseAccount(bad)).toBeNull();
    }
    expect(() => payableAccount('')).toThrow(RangeError);
    expect(() => payableAccount('a:b')).toThrow(RangeError);
  });

  it('reads assets as debit-positive and liabilities or equity as credit-positive', () => {
    expect(naturalBalance('cash:provider', 10_900)).toBe(10_900);
    expect(naturalBalance('receivable:member:M5', 1_000)).toBe(1_000);
    expect(naturalBalance('payable:member:M7', -9_909)).toBe(9_909);
    expect(naturalBalance('fund:solidarity', -991)).toBe(991);
    expect(naturalBalance('fund:general', 8)).toBe(-8);
    expect(naturalBalance('pot:round:r5', -100)).toBe(100);
  });
});
