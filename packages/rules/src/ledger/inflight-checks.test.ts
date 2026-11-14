import { describe, expect, it } from 'vitest';
import { disbursementReturnedPostings } from './disbursement-postings';
import { paymentReceivedPostings } from './fee-postings';
import { checkLedger } from './invariants';
import {
  chainOf,
  forgedChainOf,
  completeOf,
  entry,
  seedFund,
  sendOf,
  TEST_GROUP,
} from './ledger.test-support';
import { reversalPostings } from './postings';
import type { LedgerEntry } from './types';

const credit = (m: string, amount: number) =>
  entry(
    'PAYMENT_RECEIVED',
    paymentReceivedPostings({
      payerMembershipId: 'SEED',
      fee: 0,
      feeSource: 'PROVIDER',
      parts: [
        { kind: 'CONTRIBUTION', amount, creditorMembershipId: m },
        { kind: 'SOLIDARITY', amount: 6_000 },
      ],
    }),
    { membershipId: 'SEED' },
  );
const returnOf = (
  sent: LedgerEntry,
  sentSeq: number,
  postings = disbursementReturnedPostings(sent.postings),
) =>
  entry(
    'DISBURSEMENT_RETURNED',
    { postings, metadata: { sentSeq } },
    { membershipId: sent.membershipId },
  );

describe('disbursements in flight in the ledger (D18.1)', () => {
  it('accepts a send left in flight, then completed at a different fee', () => {
    const sent = sendOf('WITHDRAWAL', 'M7', 9_000, { id: 'w1' });
    expect(checkLedger(TEST_GROUP, chainOf([credit('M7', 10_000), sent]))).toEqual([]);
    expect(
      checkLedger(
        TEST_GROUP,
        chainOf([...seedFund(1_000), credit('M7', 10_000), sent, completeOf(sent, 600)]),
      ),
    ).toEqual([]);
  });

  it('accepts a failed send returned exactly to its source', () => {
    for (const sent of [
      sendOf('WITHDRAWAL', 'M7', 9_000),
      sendOf('LOAN', 'M7', 5_000, { interest: 500 }),
      sendOf('SOLIDARITY', 'M2', 5_000),
    ]) {
      const txs = chainOf([...seedFund(20_000), credit('M7', 10_000), sent, returnOf(sent, 4)]);
      expect(checkLedger(TEST_GROUP, txs)).toEqual([]);
    }
  });

  it('refuses a completion of the wrong kind, member, amount or estimated fee', () => {
    const sent = sendOf('WITHDRAWAL', 'M7', 9_000);
    const done = completeOf(sent);
    const before = [credit('M7', 10_000), sent];
    const at3 = (e: LedgerEntry) => checkLedger(TEST_GROUP, chainOf([...before, e]))[0];
    expect(at3({ ...done, type: 'LOAN_DISBURSED' })).toMatchObject({
      seq: 3,
      code: 'IN_FLIGHT_MISMATCH',
    });
    expect(at3({ ...done, membershipId: 'M9' })).toMatchObject({
      seq: 3,
      code: 'IN_FLIGHT_MISMATCH',
    });
    const short = completeOf(
      sendOf('WITHDRAWAL', 'M7', 8_000, { id: sent.postings[1]!.account.split(':')[2] }),
    );
    expect(at3(short)).toMatchObject({
      seq: 3,
      code: 'IN_FLIGHT_MISMATCH',
      detail: expect.stringContaining('holds 9500'),
    });
    const otherEstimate = completeOf(
      sendOf('WITHDRAWAL', 'M7', 9_100, {
        id: sent.postings[1]!.account.split(':')[2],
        feeEstimated: 400,
      }),
    );
    expect(at3(otherEstimate)).toMatchObject({ seq: 3, code: 'IN_FLIGHT_MISMATCH' });
  });

  it('closes an in-flight account once: no second completion, no return after completion', () => {
    const sent = sendOf('WITHDRAWAL', 'M7', 9_000);
    const done = completeOf(sent);
    const base = [...seedFund(20_000), credit('M7', 10_000), sent, done];
    expect(checkLedger(TEST_GROUP, chainOf([...base, { ...done, id: 'again' }]))).toContainEqual(
      expect.objectContaining({ seq: 6, code: 'IN_FLIGHT_MISMATCH' }),
    );
    expect(checkLedger(TEST_GROUP, chainOf([...base, returnOf(sent, 4)]))).toContainEqual(
      expect.objectContaining({ seq: 6, code: 'IN_FLIGHT_MISMATCH' }),
    );
  });

  it('refuses a send reusing an operation, a completion never sent and a partial return', () => {
    const sent = sendOf('WITHDRAWAL', 'M7', 4_000, { id: 'dup' });
    const again = sendOf('WITHDRAWAL', 'M7', 4_000, { id: 'dup' });
    expect(checkLedger(TEST_GROUP, chainOf([credit('M7', 10_000), sent, again]))[0]).toMatchObject({
      seq: 3,
      code: 'IN_FLIGHT_MISMATCH',
    });
    const ghost = completeOf(sendOf('WITHDRAWAL', 'M7', 4_000));
    expect(checkLedger(TEST_GROUP, chainOf([...seedFund(10_000), ghost]))[0]).toMatchObject({
      seq: 3,
      code: 'IN_FLIGHT_MISMATCH',
    });
    const partial = returnOf(
      sent,
      2,
      disbursementReturnedPostings(sent.postings).map((p) => ({ ...p, amount: p.amount / 2 })),
    );
    expect(
      checkLedger(TEST_GROUP, chainOf([credit('M7', 10_000), sent, partial]))[0],
    ).toMatchObject({
      seq: 3,
      code: 'IN_FLIGHT_MISMATCH',
    });
  });

  it('never reverses a send, a completion or a return: a failure is returned instead', () => {
    const sent = sendOf('WITHDRAWAL', 'M7', 4_000);
    const reversal = entry('REVERSAL', reversalPostings(sent.postings), {
      refType: 'LEDGER_TRANSACTION',
      refId: sent.id,
      metadata: { reversesSeq: 2 },
    });
    expect(
      checkLedger(TEST_GROUP, chainOf([credit('M7', 10_000), sent, reversal]))[0],
    ).toMatchObject({
      seq: 3,
      code: 'REVERSAL_MISMATCH',
    });
  });

  it('refuses money moved through an in-flight account by any other entry', () => {
    const sent = sendOf('WITHDRAWAL', 'M7', 4_000, { id: 'w9' });
    const sneak = entry('AUTO_SETTLEMENT', [
      { account: 'inflight:disbursement:w9', amount: 100 },
      { account: 'receivable:member:M7', amount: -100 },
    ]);
    expect(
      checkLedger(TEST_GROUP, forgedChainOf([credit('M7', 10_000), sent, sneak]))[0],
    ).toMatchObject({
      seq: 3,
      code: 'ACCOUNT_NOT_ALLOWED',
    });
  });
});
