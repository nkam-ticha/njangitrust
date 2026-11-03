import { describe, expect, it } from 'vitest';
import { checkLedger } from './invariants';
import { chainOf, entry, seedFund, TEST_GROUP } from './ledger.test-support';
import {
  autoSettlementPostings,
  fineAssessedPostings,
  loanDisbursedPostings,
  paymentReceivedPostings,
  reversalPostings,
  solidarityDisbursedPostings,
  withdrawalCompletedPostings,
} from './postings';

const payRound4 = (payer: string) =>
  entry(
    'PAYMENT_RECEIVED',
    paymentReceivedPostings({
      payerMembershipId: payer,
      fee: 100,
      parts: [
        { kind: 'CONTRIBUTION', amount: 10_000, creditorMembershipId: 'M7' },
        { kind: 'SOLIDARITY', amount: 1_000 },
      ],
    }).postings,
  );

describe('ledger invariants after every transaction (2.5)', () => {
  it('finds nothing wrong in a valid ledger', () => {
    const txs = chainOf([
      payRound4('M3'),
      entry('FINE_ASSESSED', fineAssessedPostings({ membershipId: 'M7', amount: 1_000 })),
      entry('AUTO_SETTLEMENT', autoSettlementPostings({ membershipId: 'M7', amount: 1_000 })),
      entry(
        'WITHDRAWAL_COMPLETED',
        withdrawalCompletedPostings({
          membershipId: 'M7',
          amount: 8_409,
          feeEstimated: 500,
          feeActual: 500,
        }),
      ),
    ]);
    expect(checkLedger(TEST_GROUP, txs)).toEqual([]);
  });

  it('reports a payable going below zero at the exact seq (invariant 2)', () => {
    const txs = chainOf([
      payRound4('M3'),
      entry(
        'WITHDRAWAL_COMPLETED',
        withdrawalCompletedPostings({
          membershipId: 'M7',
          amount: 9_500,
          feeEstimated: 500,
          feeActual: 500,
        }),
      ),
    ]);
    expect(checkLedger(TEST_GROUP, txs)).toEqual([
      { seq: 2, code: 'NEGATIVE_BALANCE', detail: 'payable:member:M7 is -91' },
    ]);
  });

  it('reports cash and the solidarity fund going below zero (invariants 3 and 4)', () => {
    const loan = entry(
      'LOAN_DISBURSED',
      loanDisbursedPostings({
        membershipId: 'M7',
        principal: 30_000,
        interest: 3_000,
        feeEstimated: 500,
        feeActual: 500,
      }),
    );
    expect(checkLedger(TEST_GROUP, chainOf([loan]))).toEqual([
      { seq: 1, code: 'NEGATIVE_BALANCE', detail: 'cash:provider is -30500' },
    ]);
    const solidarity = entry(
      'SOLIDARITY_DISBURSED',
      solidarityDisbursedPostings({ amount: 2_000, feeEstimated: 500, feeActual: 500 }),
    );
    const problems = checkLedger(TEST_GROUP, chainOf([payRound4('M3'), solidarity]));
    expect(problems.map((p) => [p.seq, p.detail])).toEqual([[2, 'fund:solidarity is -1009']]);
  });

  it('accepts an exact REVERSAL once, and refuses a wrong or repeated one', () => {
    const fine = entry(
      'FINE_ASSESSED',
      fineAssessedPostings({ membershipId: 'M5', amount: 1_000 }),
    );
    const reverse = (postings = reversalPostings(fine.postings)) =>
      entry('REVERSAL', postings, {
        refType: 'LEDGER_TRANSACTION',
        refId: fine.id,
        metadata: { reversesSeq: 1 },
      });
    expect(checkLedger(TEST_GROUP, chainOf([fine, reverse()]))).toEqual([]);
    const wrong = reverse([
      { account: 'receivable:member:M5', amount: -900 },
      { account: 'fund:general', amount: 900 },
    ]);
    expect(checkLedger(TEST_GROUP, chainOf([fine, wrong]))[0]).toMatchObject({
      seq: 2,
      code: 'REVERSAL_MISMATCH',
    });
    expect(checkLedger(TEST_GROUP, chainOf([fine, reverse(), reverse()]))[0]).toMatchObject({
      seq: 3,
      code: 'REVERSAL_MISMATCH',
    });
  });

  it('reports duplicate transaction IDs', () => {
    const fine = entry(
      'FINE_ASSESSED',
      fineAssessedPostings({ membershipId: 'M5', amount: 1_000 }),
    );
    expect(checkLedger(TEST_GROUP, chainOf([fine, { ...fine }]))[0]).toMatchObject({
      seq: 2,
      code: 'DUPLICATE_ID',
    });
  });

  it('reports a tampered posting at its seq, before anything later', () => {
    const txs = chainOf([...seedFund(50_000), payRound4('M3'), payRound4('M4')]);
    const tampered = txs.map((t) =>
      t.seq === 3
        ? {
            ...t,
            postings: t.postings.map((p, i) => (i === 0 ? { ...p, amount: p.amount + 1 } : p)),
          }
        : t,
    );
    const problems = checkLedger(TEST_GROUP, tampered);
    expect(problems[0]).toMatchObject({ seq: 3, code: 'HASH_MISMATCH' });
    expect(problems.map((p) => p.code)).toContain('NOT_BALANCED');
  });
});
