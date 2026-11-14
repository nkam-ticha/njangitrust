import { describe, expect, it } from 'vitest';
import { computeBalances, summarizeBalances } from './balances';
import { planReversalCorrections } from './corrections';
import { coverageWarnings } from './coverage';
import { availableForLoans } from './derived';
import { paymentReceivedPostings } from './fee-postings';
import { checkLedger } from './invariants';
import {
  chainOf,
  completeOf,
  entry,
  paidOut,
  seedFund,
  sendOf,
  TEST_GROUP,
} from './ledger.test-support';
import { fundDistributionPostings, leaverRefundPostings, reversalPostings } from './postings';
import type { LedgerEntry } from './types';

const round4 = (payer: string, fee = 100) =>
  entry(
    'PAYMENT_RECEIVED',
    paymentReceivedPostings({
      payerMembershipId: payer,
      fee,
      feeSource: 'SCHEDULE',
      parts: [
        { kind: 'CONTRIBUTION', amount: 10_000, creditorMembershipId: 'M7' },
        { kind: 'SOLIDARITY', amount: 1_000 },
      ],
    }),
    { membershipId: payer },
  );
const lent = (entries: LedgerEntry[]) =>
  checkLedger(TEST_GROUP, chainOf(entries)).filter((p) => p.code === 'RESERVED_LENT');

describe('reserved money is never lent, refunded or distributed (H1, 2.5, R5.6, R7.2, R12.3, R9.3)', () => {
  // seedFund(5 000) then M3 pays round 4: cash 15 900, payable 9 909, solidarity 991: available 5 000.
  const base = () => [...seedFund(5_000), round4('M3')];

  it('accepts a loan of exactly what is available (P + estimated fee), refuses 1 franc more', () => {
    const exact = sendOf('LOAN', 'M2', 4_500, { feeEstimated: 500, interest: 450 });
    expect(
      availableForLoans({ summary: summarizeBalances(computeBalances(chainOf(base()))) }),
    ).toBe(5_000);
    expect(checkLedger(TEST_GROUP, chainOf([...base(), exact, completeOf(exact)]))).toEqual([]);
    const over = sendOf('LOAN', 'M2', 4_501, { feeEstimated: 500, interest: 450 });
    expect(lent([...base(), over])).toEqual([
      { seq: 4, code: 'RESERVED_LENT', detail: expect.stringContaining('5001') },
    ]);
  });

  it('refuses a leaver refund (F) above what is available', () => {
    const refund = (amount: number) =>
      entry('LEAVER_REFUND', leaverRefundPostings({ membershipId: 'M4', amount }));
    expect(lent([...base(), refund(5_000)])).toEqual([]);
    expect(lent([...base(), refund(5_001)])).toMatchObject([{ seq: 4, code: 'RESERVED_LENT' }]);
  });

  it('refuses a fund distribution whose shares add up to more than what is available', () => {
    const share = (a: number, b: number) =>
      entry(
        'FUND_DISTRIBUTION',
        fundDistributionPostings({
          shares: [
            { membershipId: 'M1', amount: a },
            { membershipId: 'M2', amount: b },
          ],
        }),
      );
    expect(lent([...base(), share(2_500, 2_500)])).toEqual([]);
    expect(lent([...base(), share(2_500, 2_501)])).toMatchObject([
      { seq: 4, code: 'RESERVED_LENT' },
    ]);
  });

  it('exempts completions: a provider fee above the estimate is borne by the fund (R4.3)', () => {
    const loan = sendOf('LOAN', 'M2', 4_500, { feeEstimated: 500 });
    const txs = chainOf([...base(), loan, completeOf(loan, 900)]);
    expect(checkLedger(TEST_GROUP, txs)).toEqual([]);
  });

  it('keeps a gap caused by a reversal a warning only, but refuses lending during it', () => {
    const before: LedgerEntry[] = [
      ...seedFund(5_000),
      round4('M3'),
      round4('M4'),
      ...paidOut('WITHDRAWAL', 'M7', 15_000),
    ];
    const chain = chainOf(before);
    const target = chain[2]!;
    const corrections = planReversalCorrections({ original: target, ledger: chain }).map((c) =>
      entry(
        c.type,
        { postings: c.postings, metadata: c.metadata },
        { membershipId: c.membershipId },
      ),
    );
    const reversal = entry('REVERSAL', reversalPostings(target.postings), {
      refType: 'LEDGER_TRANSACTION',
      refId: target.id,
      metadata: { reversesSeq: target.seq },
    });
    const broken = chainOf([...before, ...corrections, reversal]);
    expect(checkLedger(TEST_GROUP, broken)).toEqual([]);
    expect(coverageWarnings(computeBalances(broken))).toMatchObject([
      { code: 'RESERVED_NOT_COVERED' },
    ]);
    const loan = sendOf('LOAN', 'M2', 1, { feeEstimated: 0 });
    expect(lent([...before, ...corrections, reversal, loan])).toMatchObject([
      { seq: broken.length + 1, code: 'RESERVED_LENT' },
    ]);
  });
});
