import { describe, expect, it } from 'vitest';
import { clawbackReleasePostings, planClawbackReleases } from './clawback-release';
import { planReversalCorrections } from './corrections';
import { disbursementReturnedPostings } from './disbursement-postings';
import { paymentReceivedPostings } from './fee-postings';
import { checkLedger } from './invariants';
import { chainOf, completeOf, entry, refundOf, sendOf, TEST_GROUP } from './ledger.test-support';
import { reversalPostings } from './postings';
import type { LedgerEntry } from './types';
import { entryProblems } from './validation';

const solidarityPayment = (payer: string, amount = 1_000) =>
  entry(
    'PAYMENT_RECEIVED',
    paymentReceivedPostings({
      payerMembershipId: payer,
      fee: 0,
      feeSource: 'PROVIDER',
      parts: [{ kind: 'SOLIDARITY', amount }],
    }),
    { membershipId: payer },
  );

/** M3's solidarity 1 000 with a 5 000 contribution to M9, so cash can pay out every payout. */
const opening = () =>
  entry(
    'PAYMENT_RECEIVED',
    paymentReceivedPostings({
      payerMembershipId: 'M3',
      fee: 0,
      feeSource: 'PROVIDER',
      parts: [
        { kind: 'CONTRIBUTION', amount: 5_000, creditorMembershipId: 'M9' },
        { kind: 'SOLIDARITY', amount: 1_000 },
      ],
    }),
    { membershipId: 'M3' },
  );

const debtPayment = (payer: string, amount: number) =>
  entry(
    'PAYMENT_RECEIVED',
    paymentReceivedPostings({
      payerMembershipId: payer,
      fee: 0,
      feeSource: 'PROVIDER',
      parts: [{ kind: 'DEBT', amount }],
    }),
    { membershipId: payer },
  );

const send = (member: string, amount: number) =>
  sendOf('SOLIDARITY', member, amount, { feeEstimated: 0 });

/** The corrections and the REVERSAL of the payment at `seq`, planned from the ledger so far. */
function reverse(entries: LedgerEntry[], seq: number): LedgerEntry[] {
  const chain = chainOf(entries);
  const original = chain[seq - 1]!;
  const corrections = planReversalCorrections({ original, ledger: chain }).map((c) =>
    entry(c.type, { postings: c.postings, metadata: c.metadata }, { membershipId: c.membershipId }),
  );
  return [
    ...corrections,
    entry('REVERSAL', reversalPostings(original.postings), {
      refType: 'LEDGER_TRANSACTION',
      refId: original.id,
      metadata: { reversesSeq: seq },
    }),
  ];
}

const returnOf = (sent: LedgerEntry, sentSeq: number) =>
  entry(
    'DISBURSEMENT_RETURNED',
    { postings: disbursementReturnedPostings(sent.postings), metadata: { sentSeq } },
    { membershipId: sent.membershipId },
  );

/** The planned releases of the return or refund at the end of `entries`, as entries. */
function releases(
  entries: LedgerEntry[],
  debtUnpaid: (clawbackSeq: number) => boolean = () => true,
) {
  const chain = chainOf(entries);
  const plan = planClawbackReleases({ ledger: chain, returned: chain.at(-1)!, debtUnpaid });
  return {
    plan,
    entries: plan.map((r) =>
      entry(
        r.type,
        { postings: r.postings, metadata: r.metadata },
        { membershipId: r.membershipId },
      ),
    ),
  };
}

/**
 * Q1: M5 received a payout (seq 4) and M6's is in flight (seq 5) when M4's payment (seq 2) is
 * reversed: M5 owes the 1 000 (seq 6, D18.3). Then M6's send fails and the 1 000 comes back.
 */
function q1(): { entries: LedgerEntry[]; toM6: LedgerEntry } {
  const toM5 = send('M5', 1_000);
  const toM6 = send('M6', 1_000);
  const before = [solidarityPayment('M3'), solidarityPayment('M4'), toM5, completeOf(toM5), toM6];
  return { entries: [...before, ...reverse(before, 2)], toM6 };
}

describe('CLAWBACK_RELEASE postings (owner Q1, Q3)', () => {
  it('takes from the solidarity fund what it gives back: the unpaid debt, then the payable', () => {
    expect(
      clawbackReleasePostings({ debtorMembershipId: 'M5', fromDebt: 700, toPayable: 300 }),
    ).toEqual([
      { account: 'fund:solidarity', amount: 1_000 },
      { account: 'receivable:member:M5', amount: -700 },
      { account: 'payable:member:M5', amount: -300 },
    ]);
    expect(
      clawbackReleasePostings({ debtorMembershipId: 'M5', fromDebt: 0, toPayable: 300 }),
    ).toEqual([
      { account: 'fund:solidarity', amount: 300 },
      { account: 'payable:member:M5', amount: -300 },
    ]);
    expect(() =>
      clawbackReleasePostings({ debtorMembershipId: 'M5', fromDebt: 0, toPayable: 0 }),
    ).toThrow(RangeError);
  });

  it('records which clawback it releases and which return made it unnecessary, nothing else', () => {
    const release = entry(
      'CLAWBACK_RELEASE',
      {
        postings: clawbackReleasePostings({
          debtorMembershipId: 'M5',
          fromDebt: 100,
          toPayable: 0,
        }),
        metadata: { clawbackSeq: 6, releasedBySeq: 8 },
      },
      { membershipId: 'M5' },
    );
    expect(entryProblems(release)).toEqual([]);
    expect(entryProblems({ ...release, metadata: { clawbackSeq: 6 } })[0]?.code).toBe(
      'MALFORMED_TRANSACTION',
    );
    expect(
      entryProblems({ ...release, metadata: { clawbackSeq: 6, releasedBySeq: 8, amount: 1 } })[0]
        ?.code,
    ).toBe('MALFORMED_TRANSACTION');
    expect(entryProblems({ ...release, membershipId: 'M9' })[0]?.code).toBe('SHAPE_MISMATCH');
    expect(
      entryProblems({
        ...release,
        postings: [
          { account: 'fund:solidarity', amount: -100 },
          { account: 'receivable:member:M5', amount: 100 },
        ],
      })[0]?.code,
    ).toBe('SHAPE_MISMATCH');
  });
});

describe('a returned solidarity payout releases the debts it made unnecessary (owner Q1)', () => {
  it('cancels the unpaid clawback debt against the fund', () => {
    const { entries, toM6 } = q1();
    const withReturn = [...entries, returnOf(toM6, 5)];
    const { plan, entries: released } = releases(withReturn);
    expect(plan).toEqual([
      expect.objectContaining({
        type: 'CLAWBACK_RELEASE',
        membershipId: 'M5',
        metadata: { clawbackSeq: 6, releasedBySeq: 8 },
        amount: 1_000,
        fromDebt: 1_000,
        toPayable: 0,
        debtLeft: 0,
      }),
    ]);
    expect(checkLedger(TEST_GROUP, chainOf([...withReturn, ...released]))).toEqual([]);
  });

  it('credits the payable back when the debt was already paid', () => {
    const { entries, toM6 } = q1();
    const withReturn = [...entries, debtPayment('M5', 1_000), returnOf(toM6, 5)];
    const { plan, entries: released } = releases(withReturn, () => false);
    expect(plan).toMatchObject([{ amount: 1_000, fromDebt: 0, toPayable: 1_000 }]);
    expect(released[0]!.postings).toContainEqual({ account: 'payable:member:M5', amount: -1_000 });
    expect(checkLedger(TEST_GROUP, chainOf([...withReturn, ...released]))).toEqual([]);
  });

  it('must follow the return at once, exactly, and only then', () => {
    const { entries, toM6 } = q1();
    const withReturn = [...entries, returnOf(toM6, 5)];
    const { entries: released } = releases(withReturn);
    const mismatch = (list: LedgerEntry[]) =>
      checkLedger(TEST_GROUP, chainOf(list)).filter((p) => p.code === 'CORRECTION_MISMATCH');
    expect(mismatch(withReturn)).toEqual([
      { seq: 8, code: 'CORRECTION_MISMATCH', detail: expect.stringContaining('clawback seq 6') },
    ]);
    expect(mismatch([...withReturn, solidarityPayment('M3'), ...released])).toHaveLength(2);
    const smaller = entry(
      'CLAWBACK_RELEASE',
      {
        postings: clawbackReleasePostings({
          debtorMembershipId: 'M5',
          fromDebt: 999,
          toPayable: 0,
        }),
        metadata: { clawbackSeq: 6, releasedBySeq: 8 },
      },
      { membershipId: 'M5' },
    );
    expect(mismatch([...withReturn, smaller])).toEqual([
      { seq: 9, code: 'CORRECTION_MISMATCH', detail: expect.stringContaining('1000') },
    ]);
    expect(mismatch([...entries, released[0]!])).toEqual([
      { seq: 8, code: 'CORRECTION_MISMATCH', detail: expect.stringContaining('only follows') },
    ]);
  });

  it('never cancels more debt than is still unpaid', () => {
    const { entries, toM6 } = q1();
    const withReturn = [...entries, debtPayment('M5', 1_000), returnOf(toM6, 5)];
    // Declaring the paid debt unpaid would take the receivable below zero.
    const { entries: released } = releases(withReturn, () => true);
    expect(checkLedger(TEST_GROUP, chainOf([...withReturn, ...released]))).toEqual([
      { seq: 10, code: 'NEGATIVE_BALANCE', detail: 'receivable:member:M5 is -1000' },
    ]);
  });

  it('releases oldest block first, the payer before older recipients, within the money returned', () => {
    // Fund 2 000; M5 receives 500; 600 (M6) and 900 (M7) are in flight. Reversing M4's 1 000:
    // M5 owes 500 (capped at the payout) and M4, the payer, the other 500 (D18.3).
    const toM5 = send('M5', 500);
    const toM6 = send('M6', 600);
    const toM7 = send('M7', 900);
    const before = [
      solidarityPayment('M3'),
      solidarityPayment('M4'),
      toM5,
      completeOf(toM5),
      toM6,
      toM7,
    ];
    const entries = [...before, ...reverse(before, 2)];
    const chain = chainOf(entries);
    expect(chain.slice(6, 8).map((t) => [t.seq, t.type, t.membershipId])).toEqual([
      [7, 'CLAWBACK', 'M5'],
      [8, 'CLAWBACK', 'M4'],
    ]);
    const first = [...entries, returnOf(toM6, 5)];
    const one = releases(first);
    expect(one.plan.map((r) => [r.metadata.clawbackSeq, r.membershipId, r.amount])).toEqual([
      [8, 'M4', 500],
      [7, 'M5', 100],
    ]);
    const second = [...first, ...one.entries, returnOf(toM7, 6)];
    const two = releases(second);
    expect(
      two.plan.map((r) => [r.metadata.clawbackSeq, r.membershipId, r.amount, r.debtLeft]),
    ).toEqual([[7, 'M5', 400, 0]]);
    expect(checkLedger(TEST_GROUP, chainOf([...second, ...two.entries]))).toEqual([]);
  });

  it('releases nothing for clawbacks made before the payout was sent', () => {
    const toM5 = send('M5', 2_000);
    const base = [opening(), solidarityPayment('M4'), toM5, completeOf(toM5)];
    const entries = [...base, ...reverse(base, 2)];
    const later = send('M6', 500);
    const withReturn = [...entries, solidarityPayment('M8', 500), later, returnOf(later, 8)];
    expect(releases(withReturn).plan).toEqual([]);
    expect(checkLedger(TEST_GROUP, chainOf(withReturn))).toEqual([]);
  });
});

describe('a refunded solidarity payout releases its own clawbacks first (owner Q3)', () => {
  /** M5 then M2 receive 1 000; M4's payment is reversed: M2, the latest recipient, owes it. */
  function q3() {
    const toM5 = send('M5', 1_000);
    const toM2 = send('M2', 1_000);
    const m2Done = completeOf(toM2);
    const before = [opening(), solidarityPayment('M4'), toM5, completeOf(toM5), toM2, m2Done];
    return { entries: [...before, ...reverse(before, 2)], toM2, m2Done };
  }

  it('cancels what the recipient owed for the payout the operator reversed', () => {
    const { entries, toM2, m2Done } = q3();
    expect(chainOf(entries)[6]).toMatchObject({ type: 'CLAWBACK', membershipId: 'M2' });
    const withRefund = [...entries, refundOf(toM2, m2Done, 6)];
    const { plan, entries: released } = releases(withRefund);
    expect(plan).toMatchObject([
      { membershipId: 'M2', amount: 1_000, metadata: { clawbackSeq: 7, releasedBySeq: 9 } },
    ]);
    expect(checkLedger(TEST_GROUP, chainOf([...withRefund, ...released]))).toEqual([]);
  });

  it('is never reversed, and a released clawback is never reversed either', () => {
    const { entries, toM2, m2Done } = q3();
    const withRefund = [...entries, refundOf(toM2, m2Done, 6)];
    const { entries: released } = releases(withRefund);
    const all = [...withRefund, ...released];
    const chain = chainOf(all);
    const undoRelease = entry('REVERSAL', reversalPostings(chain[9]!.postings), {
      refType: 'LEDGER_TRANSACTION',
      refId: chain[9]!.id,
      metadata: { reversesSeq: 10 },
    });
    expect(checkLedger(TEST_GROUP, chainOf([...all, undoRelease]))[0]).toMatchObject({
      seq: 11,
      code: 'REVERSAL_MISMATCH',
    });
    // L2 path: the payment's REVERSAL (seq 8) is reversed, then the released clawback (seq 7).
    const undoReversal = entry('REVERSAL', reversalPostings(chain[7]!.postings), {
      refType: 'LEDGER_TRANSACTION',
      refId: chain[7]!.id,
      metadata: { reversesSeq: 8 },
    });
    const undoClawback = entry('REVERSAL', reversalPostings(chain[6]!.postings), {
      refType: 'LEDGER_TRANSACTION',
      refId: chain[6]!.id,
      metadata: { reversesSeq: 7 },
    });
    expect(
      checkLedger(TEST_GROUP, chainOf([...all, undoReversal, undoClawback])).find(
        (p) => p.code === 'CORRECTION_MISMATCH',
      ),
    ).toEqual({
      seq: 12,
      code: 'CORRECTION_MISMATCH',
      detail: expect.stringContaining('released'),
    });
  });
});
