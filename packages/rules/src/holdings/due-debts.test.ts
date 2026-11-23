// Which debts are due and so withheld from a member's money (D13.3, D18, M1). One definition for
// the withdrawal check and for the beneficiary's "debts due" figure, so they cannot disagree.
import { describe, expect, it } from 'vitest';
import { availableToWithdraw } from '../ledger';
import { dueDebtsTotal, selectDueDebts, WITHHELD_DEBT_KINDS } from './due-debts';

const now = new Date('2026-12-01T10:00:00.000Z');
const before = new Date('2026-11-30T10:00:00.000Z');
const after = new Date('2026-12-02T10:00:00.000Z');

const debt = (id: string, kind: string, amount: number, dueAt: Date, status: string = 'DUE') => ({
  id,
  kind,
  amount,
  dueAt,
  status,
});

describe('selectDueDebts', () => {
  it('names the four kinds of debt a payout withholds', () => {
    expect([...WITHHELD_DEBT_KINDS]).toEqual(['BID', 'FINE', 'CORRECTION', 'LOAN_INSTALLMENT']);
  });

  it('keeps a debt of every kind that is due and unsettled, corrections included', () => {
    const debts = [
      debt('bid', 'BID', 5_000, before),
      debt('fine', 'FINE', 1_000, before),
      debt('corr', 'CORRECTION', 2_500, before),
      debt('inst', 'LOAN_INSTALLMENT', 10_000, before),
    ];
    expect(selectDueDebts(debts, now).map((d) => d.id)).toEqual(['bid', 'fine', 'corr', 'inst']);
    expect(dueDebtsTotal(debts, now)).toBe(18_500);
  });

  it('leaves out a debt not yet due, and counts one due exactly now', () => {
    const debts = [debt('later', 'FINE', 1_000, after), debt('exact', 'FINE', 700, now)];
    expect(selectDueDebts(debts, now).map((d) => d.id)).toEqual(['exact']);
    expect(dueDebtsTotal(debts, now)).toBe(700);
  });

  it('leaves out a debt already settled or cancelled', () => {
    const debts = [
      debt('paid', 'FINE', 1_000, before, 'PAID'),
      debt('settled', 'BID', 2_000, before, 'SETTLED'),
      debt('open', 'CORRECTION', 300, before),
    ];
    expect(selectDueDebts(debts, now).map((d) => d.id)).toEqual(['open']);
  });

  it('leaves out an obligation that is not a debt (a contribution)', () => {
    const debts = [debt('c', 'CONTRIBUTION', 10_000, before), debt('f', 'FINE', 1_000, before)];
    expect(selectDueDebts(debts, now).map((d) => d.id)).toEqual(['f']);
  });

  it('accepts rows without a kind or a status (a plain amount and date)', () => {
    expect(dueDebtsTotal([{ amount: 400, dueAt: before }], now)).toBe(400);
  });

  it('refuses amounts that are not whole, not safe or negative', () => {
    expect(() => dueDebtsTotal([debt('x', 'FINE', 1.5, before)], now)).toThrow(RangeError);
    expect(() => dueDebtsTotal([debt('x', 'FINE', -1, before)], now)).toThrow(RangeError);
  });

  it('is exactly what a withdrawal holds back', () => {
    const debts = [
      debt('fine', 'FINE', 1_000, before),
      debt('corr', 'CORRECTION', 2_500, before),
      debt('later', 'LOAN_INSTALLMENT', 9_000, after),
    ];
    const figures = availableToWithdraw({
      payableBalance: 50_000,
      credits: [],
      now,
      feeSchedule: { collection: [], disbursement: [{ upTo: null, fixed: 0, ratePermille: 0 }] },
      debts,
    });
    expect(figures.heldForDebts).toBe(dueDebtsTotal(debts, now));
    expect(figures.heldForDebts).toBe(3_500);
  });
});
