import { describe, expect, it } from 'vitest';
import { planReversalCorrections } from './corrections';
import {
  disbursementRefundedPostings,
  disbursementReturnedPostings,
} from './disbursement-postings';
import { paymentReceivedPostings } from './fee-postings';
import { checkLedger } from './invariants';
import {
  chainOf,
  completeOf,
  entry,
  forgedChainOf,
  refundOf,
  seedFund,
  sendOf,
  TEST_GROUP,
} from './ledger.test-support';
import { reversalPostings } from './postings';
import type { LedgerEntry } from './types';

const credit = (m: string, amount: number, solidarity = 6_000) =>
  entry(
    'PAYMENT_RECEIVED',
    paymentReceivedPostings({
      payerMembershipId: 'SEED',
      fee: 0,
      feeSource: 'PROVIDER',
      parts: [
        { kind: 'CONTRIBUTION', amount, creditorMembershipId: m },
        { kind: 'SOLIDARITY', amount: solidarity },
      ],
    }),
    { membershipId: 'SEED' },
  );
const sorted = (postings: { account: string; amount: number }[]) =>
  [...postings].sort((a, b) => a.account.localeCompare(b.account));

describe('a completed disbursement reversed by the operator (D22.1, DISBURSEMENT_REFUNDED)', () => {
  it('puts the money back where the send took it from; the fund absorbs any fee kept', () => {
    const w = sendOf('WITHDRAWAL', 'M7', 9_000, { id: 'w1', feeEstimated: 500 });
    const wDone = completeOf(w);
    expect(
      sorted(
        disbursementRefundedPostings({ sent: w, completed: wDone, completedSeq: 4, feeKept: 0 })
          .postings,
      ),
    ).toEqual([
      { account: 'cash:provider', amount: 9_500 },
      { account: 'payable:member:M7', amount: -9_500 },
    ]);
    expect(
      disbursementRefundedPostings({ sent: w, completed: wDone, completedSeq: 4, feeKept: 500 }),
    ).toEqual({
      postings: sorted([
        { account: 'cash:provider', amount: 9_000 },
        { account: 'fund:general', amount: 500 },
        { account: 'payable:member:M7', amount: -9_500 },
      ]),
      metadata: { completedSeq: 4, feeKept: 500 },
    });
    const loan = sendOf('LOAN', 'M7', 5_000, { id: 'l1', interest: 500, feeEstimated: 500 });
    expect(
      sorted(
        disbursementRefundedPostings({
          sent: loan,
          completed: completeOf(loan, 600),
          completedSeq: 9,
          feeKept: 0,
        }).postings,
      ),
    ).toEqual([
      { account: 'cash:provider', amount: 5_600 },
      { account: 'fund:general', amount: 400 }, // interest back (500), the fee difference returned (−100)
      { account: 'receivable:member:M7', amount: -6_000 },
    ]);
    const sol = sendOf('SOLIDARITY', 'M2', 5_000, { id: 's1', feeEstimated: 500 });
    expect(
      sorted(
        disbursementRefundedPostings({
          sent: sol,
          completed: completeOf(sol),
          completedSeq: 9,
          feeKept: 500,
        }).postings,
      ),
    ).toEqual([
      { account: 'cash:provider', amount: 4_500 },
      { account: 'fund:general', amount: 500 },
      { account: 'fund:solidarity', amount: -5_000 },
    ]);
    expect(() =>
      disbursementRefundedPostings({ sent: w, completed: wDone, completedSeq: 4, feeKept: 501 }),
    ).toThrow(RangeError);
  });

  it('accepts a refund of each purpose after its completion, fee kept or not', () => {
    for (const feeKept of [0, 500]) {
      for (const sent of [
        sendOf('WITHDRAWAL', 'M7', 9_000),
        sendOf('LOAN', 'M7', 5_000, { interest: 500 }),
        sendOf('SOLIDARITY', 'M2', 5_000),
      ]) {
        const done = completeOf(sent);
        const txs = chainOf([
          ...seedFund(20_000),
          credit('M7', 10_000),
          sent,
          done,
          refundOf(sent, done, 5, feeKept),
        ]);
        expect(checkLedger(TEST_GROUP, txs)).toEqual([]);
      }
    }
  });

  it('refuses a refund before the completion, after a return, twice, or of other amounts', () => {
    const sent = sendOf('WITHDRAWAL', 'M7', 9_000);
    const done = completeOf(sent);
    const refund = refundOf(sent, done, 5);
    const base: LedgerEntry[] = [...seedFund(1_000), credit('M7', 10_000), sent];
    const firstProblem = (entries: LedgerEntry[]) =>
      checkLedger(TEST_GROUP, chainOf(entries)).find((p) => p.code === 'IN_FLIGHT_MISMATCH');
    expect(firstProblem([...base, refundOf(sent, done, 4)])).toMatchObject({ seq: 5 });
    const returned = entry(
      'DISBURSEMENT_RETURNED',
      { postings: disbursementReturnedPostings(sent.postings), metadata: { sentSeq: 4 } },
      { membershipId: 'M7' },
    );
    expect(firstProblem([...base, returned, refundOf(sent, done, 5)])).toMatchObject({ seq: 6 });
    expect(firstProblem([...base, done, refund, refundOf(sent, done, 5)])).toMatchObject({
      seq: 7,
    });
    const bigger = {
      ...refund,
      postings: refund.postings.map((p) => ({
        ...p,
        amount: p.amount < 0 ? p.amount - 1 : p.amount + 1,
      })),
    };
    expect(firstProblem([...base, done, bigger])).toMatchObject({ seq: 6 });
    const elsewhere = { ...refund, metadata: { completedSeq: 3, feeKept: 0 } };
    expect(firstProblem([...base, done, elsewhere])).toMatchObject({ seq: 6 });
    const kept = { ...refund, metadata: { completedSeq: 5, feeKept: 501 } };
    expect(firstProblem([...base, done, kept])).toMatchObject({ seq: 6 });
    expect(
      checkLedger(TEST_GROUP, forgedChainOf([...base, done, { ...refund, membershipId: 'M9' }]))[0],
    ).toMatchObject({ seq: 6 });
  });

  it('is never reversed', () => {
    const sent = sendOf('WITHDRAWAL', 'M7', 9_000);
    const done = completeOf(sent);
    const refund = refundOf(sent, done, 5);
    const undo = entry('REVERSAL', reversalPostings(refund.postings), {
      refType: 'LEDGER_TRANSACTION',
      refId: refund.id,
      metadata: { reversesSeq: 6 },
    });
    const txs = chainOf([...seedFund(1_000), credit('M7', 10_000), sent, done, refund, undo]);
    expect(checkLedger(TEST_GROUP, txs)[0]).toMatchObject({ seq: 7, code: 'REVERSAL_MISMATCH' });
  });

  it('credits installments already repaid back to the borrower (owner Q2, metadata paidBack)', () => {
    // P 5 000, I 500, fee 500: 6 000 due; 2 000 repaid before the operator reversed the loan.
    const loan = sendOf('LOAN', 'M7', 5_000, { id: 'l2', interest: 500, feeEstimated: 500 });
    const done = completeOf(loan);
    expect(
      disbursementRefundedPostings({
        sent: loan,
        completed: done,
        completedSeq: 9,
        feeKept: 0,
        paidBack: 2_000,
      }),
    ).toEqual({
      postings: sorted([
        { account: 'cash:provider', amount: 5_500 },
        { account: 'fund:general', amount: 500 },
        { account: 'payable:member:M7', amount: -2_000 },
        { account: 'receivable:member:M7', amount: -4_000 },
      ]),
      metadata: { completedSeq: 9, feeKept: 0, paidBack: 2_000 },
    });
    const all = disbursementRefundedPostings({
      sent: loan,
      completed: done,
      completedSeq: 9,
      feeKept: 0,
      paidBack: 6_000,
    }).postings;
    expect(all.find((p) => p.account.startsWith('receivable:'))).toBeUndefined();
    expect(all.find((p) => p.account.startsWith('payable:'))).toEqual({
      account: 'payable:member:M7',
      amount: -6_000,
    });
    const refund = (sent: LedgerEntry, paidBack: number) => () =>
      disbursementRefundedPostings({
        sent,
        completed: completeOf(sent),
        completedSeq: 9,
        feeKept: 0,
        paidBack,
      });
    expect(refund(loan, 6_001)).toThrow(RangeError); // never more than P + I + fee
    expect(refund(sendOf('WITHDRAWAL', 'M7', 9_000), 1)).toThrow(RangeError); // loans only
    expect(refund(loan, -1)).toThrow(RangeError);
  });

  it('accepts a loan refunded after an installment was paid only with that paidBack (Q2)', () => {
    const loan = sendOf('LOAN', 'M7', 5_000, { interest: 500, feeEstimated: 500 });
    const done = completeOf(loan);
    const installment = entry(
      'PAYMENT_RECEIVED',
      paymentReceivedPostings({
        payerMembershipId: 'M7',
        fee: 0,
        feeSource: 'PROVIDER',
        parts: [{ kind: 'DEBT', amount: 2_000, ref: 'i1' }],
      }),
      { membershipId: 'M7' },
    );
    const base = [...seedFund(20_000), credit('M7', 10_000), loan, done, installment];
    const refund = (paidBack: number) =>
      entry(
        'DISBURSEMENT_REFUNDED',
        disbursementRefundedPostings({
          sent: loan,
          completed: done,
          completedSeq: 5,
          feeKept: 0,
          paidBack,
        }),
        { membershipId: 'M7' },
      );
    expect(checkLedger(TEST_GROUP, chainOf([...base, refund(2_000)]))).toEqual([]);
    expect(checkLedger(TEST_GROUP, chainOf([...base, refund(0)]))).toEqual([
      { seq: 7, code: 'NEGATIVE_BALANCE', detail: 'receivable:member:M7 is -2000' },
    ]);
    const unrecorded = { ...refund(2_000), metadata: { completedSeq: 5, feeKept: 0 } };
    expect(checkLedger(TEST_GROUP, chainOf([...base, unrecorded]))[0]).toMatchObject({
      seq: 7,
      code: 'IN_FLIGHT_MISMATCH',
    });
    const overstated = {
      ...refund(2_000),
      metadata: { completedSeq: 5, feeKept: 0, paidBack: 3_000 },
    };
    expect(checkLedger(TEST_GROUP, chainOf([...base, overstated]))[0]).toMatchObject({
      seq: 7,
      code: 'IN_FLIGHT_MISMATCH',
    });
  });

  it('no longer counts a refunded solidarity payout as received (D18.3)', () => {
    const pay = (payer: string) =>
      entry(
        'PAYMENT_RECEIVED',
        paymentReceivedPostings({
          payerMembershipId: payer,
          fee: 0,
          feeSource: 'PROVIDER',
          parts: [{ kind: 'SOLIDARITY', amount: 1_000 }],
        }),
        { membershipId: payer },
      );
    const toM5 = sendOf('SOLIDARITY', 'M5', 1_000, { feeEstimated: 0 });
    const toM2 = sendOf('SOLIDARITY', 'M2', 1_000, { feeEstimated: 0 });
    const m2Done = completeOf(toM2);
    const before = [
      pay('M3'),
      pay('M4'),
      toM5,
      completeOf(toM5),
      toM2,
      m2Done,
      refundOf(toM2, m2Done, 6),
      sendOf('SOLIDARITY', 'M6', 1_000, { feeEstimated: 0 }), // in flight: not received yet
    ];
    const chain = chainOf(before);
    const plan = planReversalCorrections({ original: chain[1]!, ledger: chain });
    expect(plan).toEqual([
      expect.objectContaining({
        type: 'CLAWBACK',
        membershipId: 'M5',
        metadata: { forReversalOfSeq: 2, solidarityPayoutSeq: 4 },
      }),
    ]);
    const corrections = plan.map((c) =>
      entry(
        c.type,
        { postings: c.postings, metadata: c.metadata },
        { membershipId: c.membershipId },
      ),
    );
    const reversal = entry('REVERSAL', reversalPostings(chain[1]!.postings), {
      refType: 'LEDGER_TRANSACTION',
      refId: chain[1]!.id,
      metadata: { reversesSeq: 2 },
    });
    expect(checkLedger(TEST_GROUP, chainOf([...before, ...corrections, reversal]))).toEqual([]);
  });
});
