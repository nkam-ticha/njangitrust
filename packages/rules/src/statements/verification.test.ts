import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalJSON } from '../crypto';
import { memberStatementLines } from './member-lines';
import { statementTotals } from './totals';
import { BENEFICIARY, e5Scenario } from './statements.test-support';
import { isStatementCodeFormat, statementData, statementVerificationCode } from './verification';

const HEAD = 'a'.repeat(64);

function data() {
  const { transactions, obligations } = e5Scenario();
  const lines = memberStatementLines({
    membershipId: BENEFICIARY,
    transactions,
    obligations,
    period: { start: '2026-10-31T23:00:00.000Z', end: '2026-11-30T23:00:00.000Z' },
  });
  return statementData({
    groupId: 'G1',
    membershipId: BENEFICIARY,
    language: 'fr',
    period: { start: '2026-10-31T23:00:00.000Z', end: '2026-11-30T23:00:00.000Z' },
    issuedAt: '2026-12-01T06:00:00.000Z',
    lines,
    reliability: { newMember: false, score: 92, onTime: 11, due: 12, window: 12 },
  });
}

describe('statement verification code (2.14)', () => {
  it('is the first 12 hex characters of SHA-256 over the ledger head hash and the canonical data', () => {
    const d = data();
    const independent = createHash('sha256')
      .update(HEAD + canonicalJSON(d), 'utf8')
      .digest('hex')
      .slice(0, 12);
    expect(statementVerificationCode(d, HEAD)).toBe(independent);
    expect(statementVerificationCode(d, HEAD)).toMatch(/^[0-9a-f]{12}$/);
  });

  it('is the same for the same data and head, and changes with any figure, date, member or head', () => {
    const base = statementVerificationCode(data(), HEAD);
    expect(statementVerificationCode(data(), HEAD)).toBe(base);
    expect(statementVerificationCode(data(), 'b'.repeat(64))).not.toBe(base);
    const bumped = data();
    bumped.lines[0] = { ...bumped.lines[0]!, amount: bumped.lines[0]!.amount + 1 };
    expect(statementVerificationCode(bumped, HEAD)).not.toBe(base);
    expect(
      statementVerificationCode({ ...data(), issuedAt: '2026-12-01T06:00:01.000Z' }, HEAD),
    ).not.toBe(base);
    expect(statementVerificationCode({ ...data(), membershipId: 'M8' }, HEAD)).not.toBe(base);
    expect(statementVerificationCode({ ...data(), language: 'en' }, HEAD)).not.toBe(base);
  });

  it('computes the totals from the lines, never from a figure handed in', () => {
    const d = data();
    expect(d.totals).toEqual(statementTotals(d.lines));
    expect(d.totals.payouts).toBe(99_090);
  });

  it('refuses a ledger head that is not a SHA-256 hash', () => {
    expect(() => statementVerificationCode(data(), 'not-a-hash')).toThrow(RangeError);
  });

  it('recognises the public format of a code', () => {
    expect(isStatementCodeFormat('8df5721d5365')).toBe(true);
    for (const bad of [
      '',
      '8DF5721D5365',
      '8df5721d536',
      '8df5721d53650',
      '8df5721d536g',
      ' 8df5721d5365',
    ]) {
      expect(isStatementCodeFormat(bad)).toBe(false);
    }
  });
});
