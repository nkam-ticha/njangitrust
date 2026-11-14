import { describe, expect, it } from 'vitest';
import { entry } from './ledger.test-support';
import { shapeProblems } from './shapes';
import type { Posting, TransactionType } from './types';

const p = (account: string, amount: number): Posting => ({ account, amount });
const problems = (type: TransactionType, postings: Posting[]) =>
  shapeProblems(entry(type, postings));

describe('per-type posting shapes (2.5 table)', () => {
  it('accepts the shapes the builders produce', () => {
    expect(
      problems('FINE_ASSESSED', [p('receivable:member:M5', 1_000), p('fund:general', -1_000)]),
    ).toEqual([]);
    expect(
      problems('AUTO_SETTLEMENT', [p('payable:member:M7', 500), p('receivable:member:M7', -500)]),
    ).toEqual([]);
    expect(
      problems('PAYMENT_RECEIVED', [
        p('cash:provider', 11_900),
        p('payable:member:M7', -9_916),
        p('fund:solidarity', -992),
        p('receivable:member:M5', -1_000),
        p('fund:general', 8),
      ]),
    ).toEqual([]);
    expect(
      problems('POT_ASSIGNED', [p('pot:round:r5', 9_900), p('payable:member:M9', -9_900)]),
    ).toEqual([]);
  });

  it('refuses a fine posted the wrong way round', () => {
    expect(
      problems('FINE_ASSESSED', [p('receivable:member:M5', -1_000), p('fund:general', 1_000)])[0],
    ).toMatchObject({
      code: 'SHAPE_MISMATCH',
    });
  });

  it('refuses an auto-settlement between two different members', () => {
    expect(
      problems('AUTO_SETTLEMENT', [
        p('payable:member:M7', 500),
        p('receivable:member:M5', -500),
      ])[0],
    ).toMatchObject({
      code: 'SHAPE_MISMATCH',
      detail: expect.stringContaining('same member'),
    });
  });

  it('refuses a payment that takes cash out or debits a payable', () => {
    expect(
      problems('PAYMENT_RECEIVED', [p('cash:provider', -100), p('payable:member:M7', 100)]).length,
    ).toBeGreaterThan(0);
  });

  it('refuses a payment clearing debts of two different members', () => {
    expect(
      problems('PAYMENT_RECEIVED', [
        p('cash:provider', 2_000),
        p('receivable:member:M5', -1_000),
        p('receivable:member:M6', -1_000),
      ])[0],
    ).toMatchObject({ code: 'SHAPE_MISMATCH' });
  });

  it('needs exactly one pot and one payable on POT_ASSIGNED', () => {
    expect(
      problems('POT_ASSIGNED', [
        p('pot:round:r5', 9_900),
        p('payable:member:M9', -4_950),
        p('payable:member:M4', -4_950),
      ])[0],
    ).toMatchObject({ code: 'SHAPE_MISMATCH' });
  });

  it('refuses a distribution paying the same member twice', () => {
    expect(
      problems('FUND_DISTRIBUTION', [
        p('fund:general', 200),
        p('payable:member:M1', -100),
        p('payable:member:M1', -100),
      ])[0],
    ).toMatchObject({ code: 'SHAPE_MISMATCH' });
  });

  it('refuses a completion without cash going out, or taken from a payable (D18.1)', () => {
    expect(
      problems('WITHDRAWAL_COMPLETED', [
        p('inflight:disbursement:d1', 500),
        p('fund:general', -500),
      ])[0],
    ).toMatchObject({ code: 'SHAPE_MISMATCH' });
    expect(
      shapeProblems(
        entry('WITHDRAWAL_COMPLETED', [p('payable:member:M7', 500), p('cash:provider', -500)]),
      )[0],
    ).toMatchObject({ code: 'SHAPE_MISMATCH' });
  });

  it('ties a send to its member and needs exactly one in-flight account (D18.1)', () => {
    const lines = [p('payable:member:M7', 1_500), p('inflight:disbursement:d1', -1_500)];
    expect(shapeProblems(entry('DISBURSEMENT_SENT', lines, { membershipId: 'M7' }))).toEqual([]);
    expect(
      shapeProblems(entry('DISBURSEMENT_SENT', lines, { membershipId: 'M9' }))[0],
    ).toMatchObject({
      code: 'SHAPE_MISMATCH',
    });
    expect(
      shapeProblems(
        entry(
          'DISBURSEMENT_SENT',
          [p('fund:solidarity', 900), p('inflight:disbursement:d2', -900)],
          { membershipId: null },
        ),
      )[0],
    ).toMatchObject({ code: 'SHAPE_MISMATCH', detail: expect.stringContaining('recipient') });
  });

  it('accepts the two CLAWBACK variants and ties them to the debtor (D16.1, D18.3, L3)', () => {
    const payableVariant = [p('receivable:member:M7', 5_591), p('payable:member:M7', -5_591)];
    expect(
      shapeProblems(
        entry('CLAWBACK', { postings: payableVariant, metadata: { forReversalOfSeq: 3 } }),
      ),
    ).toEqual([]);
    expect(
      shapeProblems(
        entry(
          'CLAWBACK',
          { postings: payableVariant, metadata: { forReversalOfSeq: 3 } },
          { membershipId: 'M2' },
        ),
      )[0],
    ).toMatchObject({ code: 'SHAPE_MISMATCH' });
    const fundVariant = [
      p('fund:solidarity', -900),
      p('payable:member:M2', 300),
      p('receivable:member:M2', 600),
    ];
    const meta = { forReversalOfSeq: 3, solidarityPayoutSeq: 7 };
    expect(shapeProblems(entry('CLAWBACK', { postings: fundVariant, metadata: meta }))).toEqual([]);
    expect(
      shapeProblems(
        entry('CLAWBACK', { postings: fundVariant, metadata: { forReversalOfSeq: 3 } }),
      )[0],
    ).toMatchObject({ code: 'SHAPE_MISMATCH' });
    // A solidarity clawback never refills a payable at the same time.
    const wrong = [
      p('fund:solidarity', -900),
      p('payable:member:M2', -100),
      p('receivable:member:M2', 1_000),
    ];
    expect(shapeProblems(entry('CLAWBACK', { postings: wrong, metadata: meta }))[0]).toMatchObject({
      code: 'SHAPE_MISMATCH',
    });
  });

  it('places no shape on a REVERSAL (it mirrors its original)', () => {
    expect(
      problems('REVERSAL', [p('receivable:member:M5', -1_000), p('fund:general', 1_000)]),
    ).toEqual([]);
  });

  it('accepts a POT_CORRECTION partly as the winner’s debt, only for that same winner (D15)', () => {
    const lines = (receivable: string) => [
      p('payable:member:M9', 4_000),
      p(receivable, 5_909),
      p('pot:round:r5', -9_909),
    ];
    expect(problems('POT_CORRECTION', lines('receivable:member:M9'))).toEqual([]);
    expect(
      shapeProblems(
        entry('POT_CORRECTION', lines('receivable:member:M9'), { membershipId: 'M4' }),
      )[0],
    ).toMatchObject({ code: 'SHAPE_MISMATCH' });
    expect(problems('POT_CORRECTION', lines('receivable:member:M4'))[0]).toMatchObject({
      code: 'SHAPE_MISMATCH',
    });
  });

  it('needs exactly one cash line on a payment (L1)', () => {
    expect(
      problems('PAYMENT_RECEIVED', [p('payable:member:M7', -100), p('fund:general', 100)])[0],
    ).toMatchObject({
      code: 'SHAPE_MISMATCH',
    });
  });

  it('ties the payer’s receivable to the entry’s member (L1)', () => {
    const debtPayment = [
      p('cash:provider', 900),
      p('receivable:member:M5', -1_000),
      p('fund:general', 100),
    ];
    expect(shapeProblems(entry('PAYMENT_RECEIVED', debtPayment, { membershipId: 'M5' }))).toEqual(
      [],
    );
    expect(
      shapeProblems(entry('PAYMENT_RECEIVED', debtPayment, { membershipId: 'M6' }))[0],
    ).toMatchObject({
      code: 'SHAPE_MISMATCH',
    });
  });
});
