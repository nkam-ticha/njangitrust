import { describe, expect, it } from 'vitest';
import { computeBalances, summarizeBalances } from './balances';
import { planReversalCorrections } from './corrections';
import { coverageGaps, coverageWarnings } from './coverage';
import { reservedShortfall } from './derived';
import { paymentReceivedPostings } from './fee-postings';
import { checkLedger } from './invariants';
import { chainOf, entry, paidOut, seedFund, TEST_GROUP } from './ledger.test-support';
import { reversalPostings } from './postings';
import { reconcile } from './reconciliation';
import type { LedgerEntry, LedgerTransaction } from './types';

const pay = (
  payer: string,
  parts: Parameters<typeof paymentReceivedPostings>[0]['parts'],
  fee = 100,
) =>
  entry(
    'PAYMENT_RECEIVED',
    paymentReceivedPostings({ payerMembershipId: payer, fee, feeSource: 'SCHEDULE', parts }),
    {
      membershipId: payer,
    },
  );
const round4 = [
  { kind: 'CONTRIBUTION' as const, amount: 10_000, creditorMembershipId: 'M7' },
  { kind: 'SOLIDARITY' as const, amount: 1_000 },
];

/** M7 withdrew most of its payout, then M3's payment is reversed: M7 owes 5 591 (D16.1). */
function brokenThenRepaid(): { broken: LedgerTransaction[]; repaid: LedgerTransaction[] } {
  const before: LedgerEntry[] = [
    ...seedFund(5_000),
    pay('M3', round4),
    pay('M4', round4),
    ...paidOut('WITHDRAWAL', 'M7', 15_000),
  ];
  const chain = chainOf(before);
  const target = chain[2]!;
  const plan = planReversalCorrections({ original: target, ledger: chain });
  const corrections = plan.map((c) =>
    entry(c.type, { postings: c.postings, metadata: c.metadata }, { membershipId: c.membershipId }),
  );
  const reversal = entry('REVERSAL', reversalPostings(target.postings), {
    refType: 'LEDGER_TRANSACTION',
    refId: target.id,
    metadata: { reversesSeq: target.seq },
  });
  const broken = chainOf([...before, ...corrections, reversal]);
  const repay = pay('M7', [{ kind: 'DEBT', amount: 5_591, ref: 'correction' }], 0);
  return { broken, repaid: chainOf([...before, ...corrections, reversal, repay]) };
}

const statusOf = (txs: readonly LedgerTransaction[]) => {
  const summary = summarizeBalances(computeBalances(txs));
  return reconcile({
    ledgerCash: summary.cash,
    providerBalance: summary.cash,
    inFlightCollections: 0,
    inFlightDisbursements: summary.inFlight,
    inFlightFeeTolerance: 0,
    ledgerProblemCount: checkLedger(TEST_GROUP, txs).length,
    reservedShortfall: reservedShortfall(summary),
  }).status;
};

describe('reserved-money coverage is current state, not integrity (H1, D16.2)', () => {
  it('goes ALERT when a reversal breaks coverage and back to OK once the debt is repaid', () => {
    const { broken, repaid } = brokenThenRepaid();
    expect(broken.find((t) => t.type === 'CLAWBACK')!.postings).toContainEqual({
      account: 'receivable:member:M7',
      amount: 5_591,
    });
    expect(checkLedger(TEST_GROUP, broken)).toEqual([]);
    expect(reservedShortfall(summarizeBalances(computeBalances(broken)))).toBe(591);
    expect(statusOf(broken)).toBe('ALERT');
    expect(checkLedger(TEST_GROUP, repaid)).toEqual([]);
    expect(statusOf(repaid)).toBe('OK');
  });

  it('lists each uncovered period with its start, end and largest shortfall', () => {
    const { broken, repaid } = brokenThenRepaid();
    expect(coverageGaps(broken)).toEqual([{ fromSeq: 7, toSeq: null, largestShortfall: 591 }]);
    expect(coverageGaps(repaid)).toEqual([{ fromSeq: 7, toSeq: 9, largestShortfall: 591 }]);
  });

  it('warns only about the present', () => {
    const { broken, repaid } = brokenThenRepaid();
    expect(coverageWarnings(computeBalances(broken))).toEqual([
      { code: 'RESERVED_NOT_COVERED', detail: expect.stringContaining('uncovered now: 591') },
    ]);
    expect(coverageWarnings(computeBalances(repaid))).toEqual([]);
  });
});
