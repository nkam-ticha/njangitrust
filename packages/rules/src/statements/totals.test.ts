import { describe, expect, it } from 'vitest';
import { statementTotals } from './totals';
import type { StatementLine } from './types';

const line = (
  fields: Partial<StatementLine> & Pick<StatementLine, 'category' | 'amount'>,
): StatementLine => ({
  kind: 'CONTRIBUTION',
  at: '2026-11-01T00:00:00.000Z',
  seq: 1,
  roundNumber: null,
  onTime: null,
  feeShare: 0,
  interest: 0,
  reversal: false,
  ...fields,
});

describe('statement totals (2.14)', () => {
  it('is zero everywhere for a statement without lines', () => {
    expect(Object.values(statementTotals([])).every((v) => v === 0)).toBe(true);
  });

  it('adds whole francs per category, a reversal subtracting its original', () => {
    const totals = statementTotals([
      line({ category: 'contributions', amount: 10_000 }),
      line({ category: 'contributions', amount: 10_000 }),
      line({ category: 'contributions', amount: -10_000, reversal: true }),
      line({ category: 'payouts', amount: 9_909, feeShare: 91 }),
      line({ category: 'payouts', amount: 9_909, feeShare: 91 }),
      line({ category: 'loans', amount: 30_000, interest: 3_000 }),
    ]);
    expect(totals.contributions).toBe(10_000);
    expect(totals.payouts).toBe(19_818);
    expect(totals.payoutFeeShares).toBe(182);
    expect(totals.loans).toBe(30_000);
    expect(totals.loanInterest).toBe(3_000);
  });

  it('refuses an amount that is not a whole number of francs', () => {
    expect(() => statementTotals([line({ category: 'fines', amount: 1_000.5 })])).toThrow(
      RangeError,
    );
  });
});
