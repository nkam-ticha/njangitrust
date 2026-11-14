import { describe, expect, it } from 'vitest';
import { feeProblems } from './fee-checks';
import { paymentReceivedPostings } from './fee-postings';
import { completeOf, entry, sendOf } from './ledger.test-support';

const e4 = paymentReceivedPostings({
  payerMembershipId: 'M5',
  fee: 100,
  feeSource: 'PROVIDER',
  parts: [
    { kind: 'CONTRIBUTION', amount: 10_000, creditorMembershipId: 'M7', tieOrder: 8, ref: 'c4' },
    { kind: 'SOLIDARITY', amount: 1_000, ref: 's4' },
    { kind: 'DEBT', amount: 1_000, ref: 'f4' },
  ],
});
const payment = entry('PAYMENT_RECEIVED', e4);

describe('fee metadata of fee-bearing entries (R4.2, R4.4)', () => {
  it('accepts a payment whose recorded split and postings match', () => {
    expect(feeProblems(payment)).toEqual([]);
  });

  it('recomputes the R4.2 split and refuses a recorded share that differs', () => {
    const parts = e4.metadata.parts.map((p, i) =>
      i === 0 ? { ...p, feeShare: 83 } : i === 1 ? { ...p, feeShare: 9 } : p,
    );
    expect(feeProblems({ ...payment, metadata: { ...e4.metadata, parts } })[0]).toMatchObject({
      code: 'FEE_MISMATCH',
      detail: expect.stringContaining('split'),
    });
  });

  it('refuses postings that do not follow the recorded parts and fee', () => {
    expect(
      feeProblems({ ...payment, metadata: { ...e4.metadata, fee: 90 } }).length,
    ).toBeGreaterThan(0);
    const parts = e4.metadata.parts.map((p, i) =>
      i === 0 ? { ...p, account: 'payable:member:M9' } : p,
    );
    expect(feeProblems({ ...payment, metadata: { ...e4.metadata, parts } })[0]).toMatchObject({
      code: 'FEE_MISMATCH',
    });
  });

  it('refuses a fee-bearing entry without its fee metadata or with an unknown source', () => {
    expect(feeProblems({ ...payment, metadata: {} })[0]).toMatchObject({ code: 'FEE_MISMATCH' });
    expect(
      feeProblems({ ...payment, metadata: { ...e4.metadata, feeSource: 'GUESS' } })[0],
    ).toMatchObject({
      code: 'FEE_MISMATCH',
    });
  });

  it('checks completions against their estimated and actual fees (R4.3)', () => {
    const sent = sendOf('WITHDRAWAL', 'M7', 80_840);
    const done = completeOf(sent, 650);
    expect(feeProblems(done)).toEqual([]);
    expect(
      feeProblems({ ...done, metadata: { ...done.metadata, feeActual: 500 } })[0],
    ).toMatchObject({
      code: 'FEE_MISMATCH',
    });
    expect(feeProblems({ ...done, metadata: { feeSource: 'SCHEDULE' } }).length).toBeGreaterThan(0);
    const loan = completeOf(sendOf('LOAN', 'M7', 30_000, { interest: 3_000 }), 400);
    expect(feeProblems(loan)).toEqual([]);
    expect(
      feeProblems({ ...loan, metadata: { ...loan.metadata, feeEstimated: 400 } }).length,
    ).toBeGreaterThan(0);
  });

  it('rebuilds each send from its purpose, amount, fee and interest (D18.1)', () => {
    for (const sent of [
      sendOf('WITHDRAWAL', 'M7', 80_840),
      sendOf('LOAN', 'M7', 30_000, { interest: 3_000 }),
      sendOf('SOLIDARITY', 'M2', 20_000),
    ]) {
      expect(feeProblems(sent)).toEqual([]);
      const m = sent.metadata as { amount: number; interest: number };
      expect(
        feeProblems({ ...sent, metadata: { ...sent.metadata, amount: m.amount + 1 } })[0],
      ).toMatchObject({
        code: 'FEE_MISMATCH',
      });
      expect(
        feeProblems({ ...sent, metadata: { ...sent.metadata, purpose: 'GIFT' } })[0],
      ).toMatchObject({
        code: 'FEE_MISMATCH',
      });
    }
    // Interest hidden in a withdrawal is refused.
    const w = sendOf('WITHDRAWAL', 'M7', 1_000);
    expect(feeProblems({ ...w, metadata: { ...w.metadata, interest: 10 } })[0]).toMatchObject({
      code: 'FEE_MISMATCH',
    });
  });

  it('asks nothing of entries without fees', () => {
    expect(
      feeProblems(
        entry('FINE_ASSESSED', [
          { account: 'receivable:member:M5', amount: 1_000 },
          { account: 'fund:general', amount: -1_000 },
        ]),
      ),
    ).toEqual([]);
  });
});
