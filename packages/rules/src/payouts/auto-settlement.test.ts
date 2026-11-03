import { describe, expect, it } from 'vitest';
import { autoSettlement, type SettleableDebt } from './auto-settlement';

const at = (iso: string) => new Date(iso);
const round4Due = at('2026-11-27T17:00:00.000Z');
const round4Payout = at('2026-11-28T17:00:00.000Z');

const installment1: SettleableDebt = {
  id: 'i1',
  kind: 'LOAN_INSTALLMENT',
  amount: 16_750,
  dueAt: round4Due,
};
const installment2: SettleableDebt = {
  id: 'i2',
  kind: 'LOAN_INSTALLMENT',
  amount: 16_750,
  dueAt: at('2026-12-25T17:00:00.000Z'),
};
const fine: SettleableDebt = { id: 'f1', kind: 'FINE', amount: 1_000, dueAt: round4Due };

describe('auto-settlement (R5.3)', () => {
  it('E5: takes the due installment and the fine at payoutAt, leaving 81 340', () => {
    const result = autoSettlement({
      payableBalance: 99_090,
      debts: [installment2, fine, installment1],
      now: round4Payout,
    });
    expect(result).toEqual({
      settled: [fine, installment1],
      total: 17_750,
      remainingPayable: 81_340,
      notCovered: [],
    });
  });

  it('never takes an installment that is not yet due', () => {
    const result = autoSettlement({
      payableBalance: 99_090,
      debts: [installment2],
      now: round4Payout,
    });
    expect(result.settled).toEqual([]);
    expect(result.remainingPayable).toBe(99_090);
  });

  it('pays oldest first, with ties in the order winning bid, fines, installments', () => {
    const bid: SettleableDebt = { id: 'b1', kind: 'BID', amount: 5_000, dueAt: round4Due };
    const olderFine: SettleableDebt = {
      id: 'f0',
      kind: 'FINE',
      amount: 1_000,
      dueAt: at('2026-10-30T17:00:00.000Z'),
    };
    const result = autoSettlement({
      payableBalance: 100_000,
      debts: [installment1, fine, bid, olderFine],
      now: round4Payout,
    });
    expect(result.settled.map((d) => d.id)).toEqual(['f0', 'b1', 'f1', 'i1']);
  });

  it('takes whole debts only; a debt that does not fit stays due and smaller later ones are still taken', () => {
    const result = autoSettlement({
      payableBalance: 10_000,
      debts: [installment1, fine],
      now: round4Payout,
    });
    expect(result).toEqual({
      settled: [fine],
      total: 1_000,
      remainingPayable: 9_000,
      notCovered: [installment1],
    });
  });

  it('takes nothing from an empty payable and refuses negative input', () => {
    expect(autoSettlement({ payableBalance: 0, debts: [fine], now: round4Payout }).settled).toEqual(
      [],
    );
    expect(() => autoSettlement({ payableBalance: -1, debts: [], now: round4Payout })).toThrow(
      RangeError,
    );
  });
});
