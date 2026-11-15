import { describe, expect, it } from 'vitest';
import { paymentReceivedPostings } from './fee-postings';
import { checkLedger } from './invariants';
import { chainOf, entry, seedFund, TEST_GROUP } from './ledger.test-support';
import {
  fineAssessedPostings,
  fundDistributionPostings,
  leaverRefundPostings,
  reversalPostings,
} from './postings';
import type { LedgerEntry } from './types';

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

/** The REVERSAL of `original`, recorded at `seq`. */
const undo = (original: LedgerEntry, seq: number): LedgerEntry =>
  entry('REVERSAL', reversalPostings(original.postings), {
    refType: 'LEDGER_TRANSACTION',
    refId: original.id,
    metadata: { reversesSeq: seq },
  });

/** seedFund (seq 1, 2), `first` at seq 3, its reversal at 4, the reversal of that at 5. */
function twiceReversed(first: LedgerEntry): LedgerEntry[] {
  const reversal = undo(first, 3);
  return [...seedFund(20_000), first, reversal, undo(reversal, 4)];
}

describe('only the reversal of a payment can itself be reversed (audit 5 N1)', () => {
  it('accepts reinstating a reversed payment (the L2 path)', () => {
    expect(checkLedger(TEST_GROUP, chainOf(twiceReversed(credit('M7'))))).toEqual([]);
  });

  it('refuses to re-apply a fund distribution, a leaver refund or a fine through a reversal', () => {
    for (const first of [
      entry(
        'FUND_DISTRIBUTION',
        fundDistributionPostings({ shares: [{ membershipId: 'M1', amount: 15_000 }] }),
      ),
      entry('LEAVER_REFUND', leaverRefundPostings({ membershipId: 'M2', amount: 15_000 })),
      entry('FINE_ASSESSED', fineAssessedPostings({ membershipId: 'M3', amount: 1_000 })),
    ]) {
      const problems = checkLedger(TEST_GROUP, chainOf(twiceReversed(first)));
      expect(problems, first.type).toEqual([
        {
          seq: 5,
          code: 'REVERSAL_MISMATCH',
          detail: expect.stringContaining('only the reversal of a payment'),
        },
      ]);
    }
  });

  it('no longer lets a second distribution bypass the reserved-money check', () => {
    // Without N1, re-applying a distribution of 15 000 after 15 000 was credited to M7 lent money
    // reserved for M7 with no RESERVED_LENT problem.
    const first = entry(
      'FUND_DISTRIBUTION',
      fundDistributionPostings({ shares: [{ membershipId: 'M1', amount: 15_000 }] }),
    );
    const reversal = undo(first, 3);
    const entries = [...seedFund(20_000), first, reversal, credit('M7'), undo(reversal, 4)];
    expect(checkLedger(TEST_GROUP, chainOf(entries)).map((p) => [p.seq, p.code])).toEqual([
      [6, 'REVERSAL_MISMATCH'],
    ]);
  });
});
