// A UUID is random hex, so a "6" followed by eight more digits turns up inside one by chance far
// more often than the phone pattern's rarity suggests: this guard must not mistake account names
// like `payable:member:<uuid>` for an unmasked number (2.11, 2.14), while still catching a real one.
import { describe, expect, it } from 'vitest';
import { unmaskedPhoneProblems } from './export-checks';

describe('the export’s phone-number guard (2.11, 2.14)', () => {
  it('does not flag an account name holding a UUID with digits that happen to look like a number', () => {
    // Taken from a real false positive: "7c6515293613" inside the UUID reads as 6 + 8 digits.
    const value = 'payable:member:8d97f7e4-7d9b-49d2-bb20-7c6515293613';
    expect(unmaskedPhoneProblems({ account: value })).toEqual([]);
  });

  it('still catches a real number, even written next to a UUID', () => {
    const value = 'payable:member:8d97f7e4-7d9b-49d2-bb20-7c6515293613 677123456';
    expect(unmaskedPhoneProblems({ note: value })).toEqual([
      { seq: null, code: 'UNMASKED_PHONE_NUMBER', detail: 'unmasked phone number at note' },
    ]);
  });

  it('still catches a real number with the +237 prefix inside otherwise UUID-like text', () => {
    const value = 'ref 11111111-2222-3333-4444-555555555555 +237677123456';
    expect(unmaskedPhoneProblems({ note: value })).toHaveLength(1);
  });

  it('never flags a bare hex id (unchanged behaviour)', () => {
    expect(unmaskedPhoneProblems({ id: '8d97f7e4-7d9b-49d2-bb20-7c6515293613' })).toEqual([]);
  });

  it('has no false positive across many random account-name-like strings', () => {
    // A cheap, deterministic stand-in for A2's 200,000-string check: many UUIDs embedded in account
    // name shapes, none containing a real phone number.
    let seed = 1;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const hex = () => Math.floor(rand() * 16).toString(16);
    const uuid = () =>
      [8, 4, 4, 4, 12].map((n) => Array.from({ length: n }, hex).join('')).join('-');
    const kinds = ['payable:member:', 'receivable:member:', 'pot:round:', 'inflight:disbursement:'];
    let flagged = 0;
    for (let i = 0; i < 2_000; i++) {
      const value = kinds[i % kinds.length] + uuid();
      if (unmaskedPhoneProblems({ account: value }).length > 0) flagged++;
    }
    expect(flagged).toBe(0);
  });
});
