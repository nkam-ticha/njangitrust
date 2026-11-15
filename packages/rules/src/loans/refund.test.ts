import { describe, expect, it } from 'vitest';
import { loanRefundSettlement } from './refund';

const inst = (id: string, amount: number, status: 'DUE' | 'PAID' | 'SETTLED' | 'CANCELLED') => ({
  id,
  amount,
  status,
  inPendingPayment: false,
});

describe('a loan the operator reversed after completion (D22.1, owner Q2)', () => {
  it('credits back what was repaid and cancels the unpaid installments (E3 terms)', () => {
    expect(
      loanRefundSettlement({
        totalDue: 33_500,
        installments: [inst('i1', 16_750, 'SETTLED'), inst('i2', 16_750, 'DUE')],
      }),
    ).toEqual({
      ok: true,
      paidBack: 16_750,
      cancelInstallmentIds: ['i2'],
      receivableReduction: 16_750,
    });
  });

  it('gives nothing back when nothing was repaid, everything when all was', () => {
    const due = [inst('i1', 16_750, 'DUE'), inst('i2', 16_750, 'DUE')];
    expect(loanRefundSettlement({ totalDue: 33_500, installments: due })).toMatchObject({
      paidBack: 0,
      cancelInstallmentIds: ['i1', 'i2'],
      receivableReduction: 33_500,
    });
    const paid = [inst('i1', 16_750, 'PAID'), inst('i2', 16_750, 'SETTLED')];
    expect(loanRefundSettlement({ totalDue: 33_500, installments: paid })).toMatchObject({
      paidBack: 33_500,
      cancelInstallmentIds: [],
      receivableReduction: 0,
    });
  });

  it('waits while an installment payment is still pending (spec 2.6 rule 3)', () => {
    expect(
      loanRefundSettlement({
        totalDue: 33_500,
        installments: [
          inst('i1', 16_750, 'DUE'),
          { ...inst('i2', 16_750, 'DUE'), inPendingPayment: true },
        ],
      }),
    ).toEqual({ ok: false, code: 'INSTALLMENT_PAYMENT_PENDING', installmentId: 'i2' });
  });

  it('refuses installments that do not add up to the loan total', () => {
    expect(() =>
      loanRefundSettlement({ totalDue: 33_500, installments: [inst('i1', 16_750, 'DUE')] }),
    ).toThrow(RangeError);
  });
});
