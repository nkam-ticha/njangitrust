// Spec 3.17: worked examples E6 to E10, end to end through the rules and the ledger. They must pass
// to the franc. Group of 10 members M1 to M10, contribution 10 000, solidarity 1 000, fixture fees
// 100 per collection and 500 per disbursement.

import { describe, expect, it } from 'vitest';
import {
  autoSettlement,
  availableForLoans,
  autoSettlementPostings,
  bidAssessedPostings,
  checkLedger,
  closeBidding,
  computeBalances,
  exitSettlement,
  fineAssessedPostings,
  fundDistribution,
  fundDistributionPostings,
  genesisHash,
  leaverRefundPostings,
  paymentReceivedPostings,
  reliabilityScore,
  summarizeBalances,
  thresholdCount,
} from '../index';
import { chainOf, entry, paidOut, seedFund, TEST_GROUP } from '../ledger/ledger.test-support';
import { MEMBERS, round4, round5 } from './worked-examples.test-support';

describe('3.17 worked examples E6 to E10', () => {
  it('E6 bidding: M4 and M9 tie at 5 000, M9 reached it first and wins; BID_ASSESSED settled at payout', () => {
    const at = (iso: string) => new Date(`2027-03-26T${iso}:00.000Z`);
    const outcome = closeBidding({
      groupId: TEST_GROUP,
      cycleNumber: 1,
      roundNumber: 5,
      roundId: 'r5',
      latestLedgerHash: genesisHash(TEST_GROUP),
      eligibleMembershipIds: ['M1', 'M4', 'M9'],
      bids: [
        { membershipId: 'M1', amount: 3_000, reachedAt: at('10:00') },
        { membershipId: 'M4', amount: 5_000, reachedAt: at('11:00') },
        { membershipId: 'M9', amount: 5_000, reachedAt: at('09:30') },
      ],
    });
    expect(outcome).toMatchObject({
      outcome: 'WINNING_BID',
      beneficiaryMembershipId: 'M9',
      amount: 5_000,
    });
    expect(bidAssessedPostings({ membershipId: 'M9', amount: 5_000 })).toEqual([
      { account: 'receivable:member:M9', amount: 5_000 },
      { account: 'fund:general', amount: -5_000 },
    ]);
    const bid = { id: 'b5', kind: 'BID' as const, amount: 5_000, dueAt: round5.payoutAt };
    expect(autoSettlement({ payableBalance: 99_090, debts: [bid], now: round5.dueAt }).total).toBe(
      0,
    );
    expect(
      autoSettlement({ payableBalance: 99_090, debts: [bid], now: round5.payoutAt }).total,
    ).toBe(5_000);
  });

  it('E7 vote thresholds: 10 eligible → 6 and 7; 9 eligible → 5 and 6', () => {
    expect([thresholdCount('MAJORITY', 10), thresholdCount('TWO_THIRDS', 10)]).toEqual([6, 7]);
    expect([thresholdCount('MAJORITY', 9), thresholdCount('TWO_THIRDS', 9)]).toEqual([5, 6]);
  });

  it('E8 fund distribution: 37 003 among 9 gives 4 111 each (36 999), 4 stay in the fund', () => {
    // 37 003 of collected money: fines paid into the fund, and M10 still owing a loan.
    const before = [...seedFund(67_503), ...paidOut('LOAN', 'M10', 30_000, { interest: 3_000 })];
    const summary = summarizeBalances(computeBalances(before));
    expect(summary.generalFund - summary.receivables).toBe(37_003);
    const result = fundDistribution({
      distributeFundAtCycleEnd: true,
      generalFundBalance: summary.generalFund,
      outstandingReceivables: summary.receivables,
      availableForLoans: availableForLoans({ summary }),
      candidates: MEMBERS.map((m) => ({
        membershipId: m,
        activeWholeCycle: true,
        outstandingDebt: summary.receivableByMember[m] ?? 0,
      })),
    });
    expect(result).toMatchObject({ ok: true, share: 4_111, distributed: 36_999, remainder: 4 });
    if (!result.ok) return;
    expect(result.shares).toHaveLength(9);
    const txs = chainOf([
      ...before,
      entry('FUND_DISTRIBUTION', fundDistributionPostings({ shares: result.shares })),
    ]);
    expect(checkLedger(TEST_GROUP, txs)).toEqual([]);
    const after = summarizeBalances(computeBalances(txs));
    expect(availableForLoans({ summary: after })).toBe(4);
    expect(after.payableByMember.M1).toBe(4_111);
  });

  it('E9 mid-cycle exit, not yet served: refund 25 000, payable 24 000, shortfall 6 × 1 667 + 3 × 1 666', () => {
    const fine = { id: 'f6', kind: 'FINE' as const, amount: 1_000, dueAt: round4.dueAt };
    const remaining = MEMBERS.filter((m) => m !== 'M6');
    const result = exitSettlement({
      served: false,
      contributionsPaidThisCycle: 40_000,
      availableForLoans: 25_000,
      leaverPayableBalance: 0,
      leaverDebts: [fine],
      leaverLoanInstallments: [],
      remainingMembershipIds: remaining,
      nextRoundDueAt: round5.dueAt,
      now: round4.payoutAt,
    });
    if (result.kind !== 'NOT_SERVED') throw new Error('expected a refund');
    expect(result).toMatchObject({
      refund: 40_000,
      fromFund: 25_000,
      shortfall: 15_000,
      payableAfter: 24_000,
    });
    expect(result.shortfallShares.map((s) => s.amount)).toEqual([
      1667, 1667, 1667, 1667, 1667, 1667, 1666, 1666, 1666,
    ]);
    const txs = chainOf([
      ...seedFund(25_000),
      entry('FINE_ASSESSED', fineAssessedPostings({ membershipId: 'M6', amount: 1_000 })),
      entry('LEAVER_REFUND', leaverRefundPostings({ membershipId: 'M6', amount: result.fromFund })),
      entry(
        'AUTO_SETTLEMENT',
        autoSettlementPostings({ membershipId: 'M6', amount: result.settlement.total }),
      ),
      // A shortfall share paid by M1 credits M6 net of its fee share.
      entry(
        'PAYMENT_RECEIVED',
        paymentReceivedPostings({
          payerMembershipId: 'M1',
          fee: 100,
          feeSource: 'SCHEDULE',
          parts: [{ kind: 'SHORTFALL', amount: 1_667, creditorMembershipId: 'M6' }],
        }),
      ),
    ]);
    expect(checkLedger(TEST_GROUP, txs)).toEqual([]);
    expect(summarizeBalances(computeBalances(txs)).payableByMember.M6).toBe(24_000 + 1_567);
  });

  it('E10 reliability: 11 of 12 on time gives 92', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({
      kind: 'ROUND' as const,
      dueAt: new Date(Date.UTC(2026, i - 12, 27)),
      onTime: i !== 5,
    }));
    expect(
      reliabilityScore({ items, reliabilityWindow: 12, now: new Date('2026-11-02T00:00:00.000Z') }),
    ).toEqual({
      kind: 'SCORE',
      score: 92,
      onTime: 11,
      due: 12,
    });
  });
});
