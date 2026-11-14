import { describe, expect, it } from 'vitest';
import { planReversalCorrections } from './corrections';
import { paymentReceivedPostings } from './fee-postings';
import { checkLedger } from './invariants';
import { chainOf, entry, paidOut, seedFund, sendOf, TEST_GROUP } from './ledger.test-support';
import { reversalPostings } from './postings';
import type { LedgerEntry, LedgerTransaction } from './types';

const pay = (payer: string, parts: Parameters<typeof paymentReceivedPostings>[0]['parts']) =>
  entry(
    'PAYMENT_RECEIVED',
    paymentReceivedPostings({ payerMembershipId: payer, fee: 100, feeSource: 'SCHEDULE', parts }),
    {
      membershipId: payer,
    },
  );
const reversalOf = (tx: LedgerTransaction) =>
  entry('REVERSAL', reversalPostings(tx.postings), {
    refType: 'LEDGER_TRANSACTION',
    refId: tx.id,
    metadata: { reversesSeq: tx.seq },
  });
/** Plans the corrections against the ledger so far and appends them, then the REVERSAL. */
function reverseWithCorrections(before: LedgerEntry[], targetIndex: number): LedgerTransaction[] {
  const chain = chainOf(before);
  const target = chain[targetIndex]!;
  const plan = planReversalCorrections({ original: target, ledger: chain });
  const corrections = plan.map((c) =>
    entry(c.type, { postings: c.postings, metadata: c.metadata }, { membershipId: c.membershipId }),
  );
  return chainOf([...before, ...corrections, reversalOf(target)]);
}
const round4 = [
  { kind: 'CONTRIBUTION' as const, amount: 10_000, creditorMembershipId: 'M7' },
  { kind: 'SOLIDARITY' as const, amount: 1_000 },
];

describe('reversing a payment already paid out (D16.1, D18.1)', () => {
  it('needs no correction while the beneficiary still holds the money', () => {
    const chain = chainOf([...seedFund(20_000), pay('M3', round4)]);
    expect(planReversalCorrections({ original: chain[2]!, ledger: chain })).toEqual([]);
  });

  it('makes a FIXED-mode beneficiary who already withdrew owe the missing part (CLAWBACK)', () => {
    const before = [
      ...seedFund(20_000),
      pay('M3', round4),
      pay('M4', round4),
      ...paidOut('WITHDRAWAL', 'M7', 15_000),
    ];
    const chain = chainOf(before);
    // M7 holds 19 818 − 15 500 = 4 318; the reversed credit is 9 909, so 5 591 becomes M7's debt.
    expect(planReversalCorrections({ original: chain[2]!, ledger: chain })).toEqual([
      {
        type: 'CLAWBACK',
        membershipId: 'M7',
        postings: [
          { account: 'receivable:member:M7', amount: 5_591 },
          { account: 'payable:member:M7', amount: -5_591 },
        ],
        metadata: { forReversalOfSeq: 3 },
      },
    ]);
    expect(checkLedger(TEST_GROUP, reverseWithCorrections(before, 2))).toEqual([]);
  });

  it('reads a withdrawal still in flight from the ledger: it already left the payable (D18.1, L6)', () => {
    const before = [...seedFund(20_000), pay('M3', round4), sendOf('WITHDRAWAL', 'M7', 4_500)];
    const chain = chainOf(before);
    const plan = planReversalCorrections({ original: chain[2]!, ledger: chain });
    expect(plan[0]!.postings).toContainEqual({ account: 'receivable:member:M7', amount: 5_000 });
    const txs = reverseWithCorrections(before, 2);
    expect(checkLedger(TEST_GROUP, txs)).toEqual([]);
    expect(txs.map((t) => t.type).slice(-3)).toEqual(['DISBURSEMENT_SENT', 'CLAWBACK', 'REVERSAL']);
  });
});

const solidarityTo = (recipient: string, amount: number) =>
  paidOut('SOLIDARITY', recipient, amount, { feeEstimated: 0 });

describe('solidarity shortfalls (D17, D18.3)', () => {
  it('caps the latest recipient at their payout and rolls the rest back to the previous one', () => {
    // M8 got 1 000, then M2 got 900: the fund holds 82, so reversing a 991 credit leaves 909 to find.
    const before = [
      ...seedFund(20_000),
      pay('M3', round4),
      pay('M4', round4),
      ...solidarityTo('M8', 1_000),
      ...solidarityTo('M2', 900),
    ];
    const txs = reverseWithCorrections(before, 2);
    const clawbacks = txs.filter((t) => t.type === 'CLAWBACK');
    expect(
      clawbacks.map((t) => [t.membershipId, t.metadata.solidarityPayoutSeq, t.postings]),
    ).toEqual([
      [
        'M2',
        8,
        [
          { account: 'fund:solidarity', amount: -900 },
          { account: 'receivable:member:M2', amount: 900 },
        ],
      ],
      [
        'M8',
        6,
        [
          { account: 'fund:solidarity', amount: -9 },
          { account: 'receivable:member:M8', amount: 9 },
        ],
      ],
    ]);
    expect(checkLedger(TEST_GROUP, txs)).toEqual([]);
  });

  it('counts a payout in flight as gone; with no recipient left, the payer owes it, payable first (M2)', () => {
    // M3 was credited 9 909 as round 3's beneficiary, then paid round 4; 900 of the fund is in flight.
    const round3ToM3 = [
      { kind: 'CONTRIBUTION' as const, amount: 10_000, creditorMembershipId: 'M3' },
    ];
    const before = [
      ...seedFund(20_000),
      pay('M4', round3ToM3),
      pay('M3', round4),
      sendOf('SOLIDARITY', 'M2', 900, { feeEstimated: 0 }),
    ];
    const txs = reverseWithCorrections(before, 3);
    const clawback = txs.find((t) => t.type === 'CLAWBACK')!;
    expect(clawback).toMatchObject({
      membershipId: 'M3',
      metadata: { forReversalOfSeq: 4, solidarityPayoutSeq: null },
    });
    expect(clawback.postings).toEqual([
      { account: 'fund:solidarity', amount: -900 },
      { account: 'payable:member:M3', amount: 900 },
    ]);
    expect(checkLedger(TEST_GROUP, txs)).toEqual([]);
  });

  it('refuses a solidarity clawback charged to anyone but the next debtor in D18.3 order', () => {
    const before = [...seedFund(20_000), pay('M3', round4), ...solidarityTo('M2', 900)];
    const chain = chainOf(before);
    const wrong = entry(
      'CLAWBACK',
      {
        postings: [
          { account: 'receivable:member:M5', amount: 900 },
          { account: 'fund:solidarity', amount: -900 },
        ],
        metadata: { forReversalOfSeq: 3, solidarityPayoutSeq: 5 },
      },
      { membershipId: 'M5' },
    );
    expect(
      checkLedger(TEST_GROUP, chainOf([...before, wrong, reversalOf(chain[2]!)]))[0],
    ).toMatchObject({
      seq: 6,
      code: 'CORRECTION_MISMATCH',
    });
  });
});

describe('forged corrections (H2, L2, L6)', () => {
  const valid = () =>
    reverseWithCorrections(
      [
        ...seedFund(20_000),
        pay('M3', round4),
        pay('M4', round4),
        ...paidOut('WITHDRAWAL', 'M7', 15_000),
      ],
      2,
    );
  const entries = () => valid().map((t): LedgerEntry => ({ ...t }));

  it('refuses an oversized CLAWBACK (an interest-free loan from the fund)', () => {
    const e = entries();
    e[6] = {
      ...e[6]!,
      postings: [
        { account: 'receivable:member:M7', amount: 9_909 },
        { account: 'payable:member:M7', amount: -9_909 },
      ],
    };
    expect(checkLedger(TEST_GROUP, chainOf(e))[0]).toMatchObject({
      seq: 7,
      code: 'CORRECTION_MISMATCH',
    });
  });

  it('refuses a second correction on the same account in one block', () => {
    const e = entries();
    const second = {
      ...e[6]!,
      id: 'again',
      postings: [
        { account: 'receivable:member:M7', amount: 1 },
        { account: 'payable:member:M7', amount: -1 },
      ],
    };
    const problems = checkLedger(TEST_GROUP, chainOf([...e.slice(0, 7), second, e[7]!]));
    expect(problems[0]).toMatchObject({
      seq: 8,
      code: 'CORRECTION_MISMATCH',
      detail: expect.stringContaining('only one'),
    });
  });

  it('refuses reversing a correction alone, and accepts it once its payment reversal is undone (L2)', () => {
    const txs = valid();
    const clawback = txs[6]!;
    expect(
      checkLedger(
        TEST_GROUP,
        chainOf([...txs.map((t): LedgerEntry => ({ ...t })), reversalOf(clawback)]),
      ),
    ).toContainEqual(expect.objectContaining({ seq: 9, code: 'CORRECTION_MISMATCH' }));
    const undo = chainOf([...txs.map((t): LedgerEntry => ({ ...t })), reversalOf(txs[7]!)]);
    expect(
      checkLedger(
        TEST_GROUP,
        chainOf([...undo.map((t): LedgerEntry => ({ ...t })), reversalOf(clawback)]),
      ),
    ).toEqual([]);
  });
});
