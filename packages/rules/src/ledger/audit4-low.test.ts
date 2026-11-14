import { describe, expect, it } from 'vitest';
import { clawbackPostings, planReversalCorrections } from './corrections';
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
import { reconcile } from './reconciliation';
import { entryProblems } from './validation';

const credit = (m: string) =>
  entry(
    'PAYMENT_RECEIVED',
    paymentReceivedPostings({
      payerMembershipId: 'SEED',
      fee: 0,
      feeSource: 'PROVIDER',
      parts: [{ kind: 'CONTRIBUTION', amount: 10_000, creditorMembershipId: m }],
    }),
    { membershipId: 'SEED' },
  );

describe('a payment names its payer (L3)', () => {
  it('refuses a PAYMENT_RECEIVED without membershipId', () => {
    expect(entryProblems({ ...credit('M7'), membershipId: null })).toEqual([
      { code: 'SHAPE_MISMATCH', detail: expect.stringContaining('payer') },
    ]);
  });
});

describe('corrections never target a disbursement entry (L4)', () => {
  const sent = sendOf('WITHDRAWAL', 'M7', 9_000);
  const done = completeOf(sent);
  const claw = (seq: number) =>
    entry(
      'CLAWBACK',
      {
        postings: clawbackPostings({ debtorMembershipId: 'M7', from: 'PAYABLE', amount: 100 }),
        metadata: { forReversalOfSeq: seq },
      },
      { membershipId: 'M7' },
    );

  it('reports a CLAWBACK prepared for a send, a completion or a refund precisely', () => {
    const base = [...seedFund(1_000), credit('M7'), sent, done, refundOf(sent, done, 5)];
    for (const [seq, type] of [
      [4, 'DISBURSEMENT_SENT'],
      [5, 'WITHDRAWAL_COMPLETED'],
      [6, 'DISBURSEMENT_REFUNDED'],
    ] as const) {
      const problem = checkLedger(TEST_GROUP, forgedChainOf([...base, claw(seq)])).find(
        (p) => p.code === 'CORRECTION_MISMATCH',
      );
      expect(problem).toEqual({
        seq: 7,
        code: 'CORRECTION_MISMATCH',
        detail: expect.stringContaining(`a ${type} is never reversed`),
      });
    }
  });

  it('refuses to plan corrections for one', () => {
    const chain = chainOf([...seedFund(1_000), credit('M7'), sent]);
    expect(() => planReversalCorrections({ original: chain[3]!, ledger: chain })).toThrow(
      RangeError,
    );
  });

  it('still corrects ordinary payments', () => {
    const before = [...seedFund(1_000), credit('M7')];
    const chain = chainOf(before);
    const reversal = entry('REVERSAL', reversalPostings(chain[2]!.postings), {
      refType: 'LEDGER_TRANSACTION',
      refId: chain[2]!.id,
      metadata: { reversesSeq: 3 },
    });
    expect(planReversalCorrections({ original: chain[2]!, ledger: chain })).toEqual([]);
    expect(checkLedger(TEST_GROUP, chainOf([...before, reversal]))).toEqual([]);
  });
});

describe('a provider fee above the estimate on a payout still in flight (L5)', () => {
  const base = {
    ledgerCash: 250_000,
    inFlightCollections: 0,
    inFlightDisbursements: 20_500,
    ledgerProblemCount: 0,
    reservedShortfall: 0,
  };

  it('is a WARNING within the documented tolerance, an ALERT beyond it', () => {
    // A 20 000 withdrawal estimated at 500 was paid with a fee of 600 before the ledger knew.
    const paid = { ...base, providerBalance: 250_000 - 20_600 };
    expect(reconcile({ ...paid, inFlightFeeTolerance: 0 }).status).toBe('ALERT');
    expect(reconcile({ ...paid, inFlightFeeTolerance: 500 })).toEqual({
      status: 'WARNING',
      difference: -20_600,
      withdrawalsPaused: false,
    });
    expect(
      reconcile({ ...base, providerBalance: 250_000 - 21_001, inFlightFeeTolerance: 500 }).status,
    ).toBe('ALERT');
  });
});
