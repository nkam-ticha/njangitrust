import { describe, expect, it } from 'vitest';
import { checkLedger } from './invariants';
import { chainOf, entry, TEST_GROUP } from './ledger.test-support';
import { paymentReceivedPostings } from './fee-postings';
import { bidAssessedPostings, potAssignedPostings, reversalPostings } from './postings';
import type { LedgerEntry } from './types';

const published = (winner: string, bids: { membershipId: string; amount: number }[]): LedgerEntry =>
  entry('EVENT', [], {
    metadata: {
      event: 'BIDS_PUBLISHED',
      cycleNumber: 1,
      roundNumber: 5,
      roundId: 'r5',
      beneficiaryMembershipId: winner,
      bids,
    },
  });
const assessed = (m: string, amount: number, roundId: string | null = 'r5') =>
  entry('BID_ASSESSED', bidAssessedPostings({ membershipId: m, amount }), {
    membershipId: m,
    roundId,
  });
// E6: M4 and M9 tie at 5 000; M9 reached it first and wins.
const e6 = [
  { membershipId: 'M9', amount: 5_000 },
  { membershipId: 'M4', amount: 5_000 },
  { membershipId: 'M1', amount: 3_000 },
];

describe('winning bids against the published result (M3, R8.3, R8.5)', () => {
  it('accepts E6: the winner is charged exactly their bid, once', () => {
    expect(checkLedger(TEST_GROUP, chainOf([published('M9', e6), assessed('M9', 5_000)]))).toEqual(
      [],
    );
  });

  it('refuses a winner who does not hold the highest bid', () => {
    expect(checkLedger(TEST_GROUP, chainOf([published('M1', e6)]))[0]).toMatchObject({
      seq: 1,
      code: 'BID_MISMATCH',
    });
  });

  it('refuses a bid charged to someone else, at another amount, twice, or without its round', () => {
    const at2 = (tx: ReturnType<typeof assessed>) =>
      checkLedger(TEST_GROUP, chainOf([published('M9', e6), tx]))[0];
    expect(at2(assessed('M4', 5_000))).toMatchObject({ seq: 2, code: 'BID_MISMATCH' });
    expect(at2(assessed('M9', 4_000))).toMatchObject({ seq: 2, code: 'BID_MISMATCH' });
    expect(at2(assessed('M9', 5_000, null))).toMatchObject({ seq: 2, code: 'BID_MISMATCH' });
    expect(
      checkLedger(
        TEST_GROUP,
        chainOf([published('M9', e6), assessed('M9', 5_000), assessed('M9', 5_000)]),
      )[0],
    ).toMatchObject({ seq: 3, code: 'BID_MISMATCH' });
  });

  it('refuses a published winning bid that is never assessed', () => {
    expect(checkLedger(TEST_GROUP, chainOf([published('M9', e6)]))).toEqual([
      expect.objectContaining({
        seq: 1,
        code: 'BID_MISMATCH',
        detail: expect.stringContaining('never assessed'),
      }),
    ]);
  });
});

describe('a second bidding result for a round (M1, R8.5)', () => {
  const payToPot = (payer: string) =>
    entry(
      'PAYMENT_RECEIVED',
      paymentReceivedPostings({
        payerMembershipId: payer,
        fee: 0,
        feeSource: 'SCHEDULE',
        parts: [{ kind: 'CONTRIBUTION', amount: 10_000, potRoundId: 'r5' }],
      }),
      { membershipId: payer },
    );
  const assign = (winner: string) =>
    entry(
      'POT_ASSIGNED',
      potAssignedPostings({ roundId: 'r5', beneficiaryMembershipId: winner, amount: 10_000 }),
    );
  const reverse = (tx: LedgerEntry, seq: number) =>
    entry('REVERSAL', reversalPostings(tx.postings), {
      refType: 'LEDGER_TRANSACTION',
      refId: tx.id,
      metadata: { reversesSeq: seq },
    });
  const again = () => published('M4', [{ membershipId: 'M4', amount: 4_000 }]);

  it('refuses a second result while the first one is assessed or its pot assigned', () => {
    const first = published('M9', e6);
    const charge = assessed('M9', 5_000);
    expect(checkLedger(TEST_GROUP, chainOf([first, charge, again()]))[0]).toMatchObject({
      seq: 3,
      code: 'BID_MISMATCH',
      detail: expect.stringContaining('already has a result'),
    });
    const pot = assign('M9');
    const charge2 = assessed('M9', 5_000);
    const partly = [payToPot('M1'), first, pot, charge2, reverse(charge2, 4), again()];
    expect(checkLedger(TEST_GROUP, chainOf(partly))[0]).toMatchObject({
      seq: 6,
      code: 'BID_MISMATCH',
    });
  });

  it('accepts a new result once the assignment and the assessment were reversed', () => {
    const first = published('M9', e6);
    const pot = assign('M9');
    const charge = assessed('M9', 5_000);
    const txs = chainOf([
      payToPot('M1'),
      first,
      pot,
      charge,
      reverse(charge, 4),
      reverse(pot, 3),
      again(),
      assign('M4'),
      assessed('M4', 4_000),
    ]);
    expect(checkLedger(TEST_GROUP, txs)).toEqual([]);
  });

  it('forgets a reversed assessment: the winning bid must be assessed again', () => {
    const charge = assessed('M9', 5_000);
    const reversed = [published('M9', e6), charge, reverse(charge, 2)];
    expect(checkLedger(TEST_GROUP, chainOf(reversed))).toEqual([
      expect.objectContaining({ seq: 1, detail: expect.stringContaining('never assessed') }),
    ]);
    expect(checkLedger(TEST_GROUP, chainOf([...reversed, assessed('M9', 5_000)]))).toEqual([]);
  });
});
