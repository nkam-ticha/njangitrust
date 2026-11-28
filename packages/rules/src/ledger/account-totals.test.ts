import { describe, expect, it } from 'vitest';
import { accountBalance, accountCreditsTotal } from './account-totals';
import { payableAccount, potAccount } from './accounts';

const payable = payableAccount('M1');
const other = payableAccount('M2');

describe('accountBalance (2.5)', () => {
  it('reads a payable as credit-positive from the postings of that account only', () => {
    const postings = [
      { account: payable, amount: -9_909 },
      { account: other, amount: -500 },
      { account: payable, amount: 1_000 },
    ];
    expect(accountBalance(payable, postings)).toBe(8_909);
    expect(accountBalance(other, postings)).toBe(500);
  });

  it('is zero (never -0) when nothing was posted', () => {
    expect(Object.is(accountBalance(payable, []), 0)).toBe(true);
    expect(Object.is(accountBalance(payable, [{ account: other, amount: -5 }]), 0)).toBe(true);
  });

  it('reads a pot as credit-positive too', () => {
    const pot = potAccount('r1');
    expect(accountBalance(pot, [{ account: pot, amount: -3_000 }])).toBe(3_000);
  });

  it('refuses a non-integer amount and an unknown account', () => {
    expect(() => accountBalance(payable, [{ account: payable, amount: 1.5 }])).toThrow(RangeError);
    expect(() => accountBalance('nope', [])).toThrow(RangeError);
  });
});

describe('accountCreditsTotal (R5.2, R6)', () => {
  it('adds only the credits (negative postings) to the account, as a positive total', () => {
    const postings = [
      { account: payable, amount: -2_000 },
      { account: payable, amount: -500 },
      { account: payable, amount: 700 },
      { account: other, amount: -9_999 },
    ];
    expect(accountCreditsTotal(payable, postings)).toBe(2_500);
  });

  it('is zero when there is no credit', () => {
    expect(accountCreditsTotal(payable, [])).toBe(0);
    expect(accountCreditsTotal(payable, [{ account: payable, amount: 40 }])).toBe(0);
  });
});
