import { describe, expect, it } from 'vitest';
import { repaymentOptions, selectInstallmentsForRepayment } from './repayment';

describe('repayment, early or due (R7.6, R7.7)', () => {
  const unpaid = [
    { id: 'i2', amount: 16_750, dueAt: new Date('2026-12-25T17:00:00.000Z') },
    { id: 'i1', amount: 16_750, dueAt: new Date('2026-11-27T17:00:00.000Z') },
  ];

  it('offers the next installment, then the next ones together; interest never changes', () => {
    expect(repaymentOptions(unpaid)).toEqual([
      { installmentIds: ['i1'], amount: 16_750 },
      { installmentIds: ['i1', 'i2'], amount: 33_500 },
    ]);
  });

  it('repays by whole installments, oldest first, by default the next one', () => {
    expect(selectInstallmentsForRepayment(unpaid, 'NEXT')).toEqual({
      ok: true,
      installmentIds: ['i1'],
      amount: 16_750,
    });
    expect(selectInstallmentsForRepayment(unpaid, 'ALL')).toEqual({
      ok: true,
      installmentIds: ['i1', 'i2'],
      amount: 33_500,
    });
    expect(selectInstallmentsForRepayment(unpaid, 33_500)).toMatchObject({
      ok: true,
      amount: 33_500,
    });
    expect(selectInstallmentsForRepayment(unpaid, 20_000)).toEqual({
      ok: false,
      code: 'AMOUNT_NOT_WHOLE_INSTALLMENTS',
      options: [16_750, 33_500],
    });
    expect(selectInstallmentsForRepayment([], 'NEXT')).toEqual({
      ok: false,
      code: 'NOTHING_TO_REPAY',
    });
  });
});
