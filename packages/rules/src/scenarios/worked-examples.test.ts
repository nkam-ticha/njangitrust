// Spec 3.17: the worked examples E1 to E10, end to end through the rules and the ledger. They must
// pass to the franc. Group of 10 members M1 to M10, contribution 10 000, solidarity 1 000, fixture
// fees 100 per collection and 500 per disbursement.

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
  installmentFine,
  leaverRefundPostings,
  loanDisbursedPostings,
  loanLimit,
  loanQuote,
  MOCK_FEE_SCHEDULE,
  paymentReceivedPostings,
  preparePayment,
  reliabilityScore,
  roundDates,
  roundLateFines,
  summarizeBalances,
  sumsToZero,
  thresholdCount,
  validateWithdrawal,
  withdrawalCompletedPostings,
  type OpenObligation,
  type PaymentPart,
} from '../index';
import { chainOf, entry, seedFund, TEST_GROUP } from '../ledger/ledger.test-support';

const MEMBERS = Array.from({ length: 10 }, (_, i) => `M${i + 1}`);
// Monthly rounds on the last Saturday at 18:00 in Douala; round 4 pays out on 27 February 2027.
const schedule = {
  firstPayoutAt: new Date('2026-11-28T17:00:00.000Z'),
  frequency: 'MONTHLY',
  monthlyAnchor: { kind: 'LAST_WEEKDAY', weekday: 6 },
} as const;
const round4 = roundDates(schedule, 4);
const round5 = roundDates(schedule, 5);

const round4Parts = (beneficiary = 'M7'): PaymentPart[] => [
  { kind: 'CONTRIBUTION', amount: 10_000, creditorMembershipId: beneficiary, tieOrder: 4 },
  { kind: 'SOLIDARITY', amount: 1_000 },
];
const payRound4 = (payer: string) =>
  entry(
    'PAYMENT_RECEIVED',
    paymentReceivedPostings({ payerMembershipId: payer, fee: 100, parts: round4Parts() }).postings,
  );
const e3Loan = () =>
  entry(
    'LOAN_DISBURSED',
    loanDisbursedPostings({
      membershipId: 'M7',
      principal: 30_000,
      interest: 3_000,
      feeEstimated: 500,
      feeActual: 500,
    }),
  );

describe('3.17 worked examples', () => {
  it('E1 fee split on one payment: 91 and 9; postings +10 900, −9 909, −991', () => {
    const { postings, parts } = paymentReceivedPostings({
      payerMembershipId: 'M3',
      fee: 100,
      parts: round4Parts(),
    });
    expect(parts.map((p) => p.feeShare)).toEqual([91, 9]);
    expect(postings).toEqual([
      { account: 'cash:provider', amount: 10_900 },
      { account: 'payable:member:M7', amount: -9_909 },
      { account: 'fund:solidarity', amount: -991 },
    ]);
    expect(sumsToZero(postings)).toBe(true);
  });

  it('E2 full round on time: M7’s payable 99 090, solidarity fund +9 910', () => {
    const txs = chainOf(MEMBERS.map(payRound4));
    const summary = summarizeBalances(computeBalances(txs));
    expect(summary.payableByMember.M7).toBe(99_090);
    expect(summary.solidarityFund).toBe(9_910);
    expect(checkLedger(TEST_GROUP, txs)).toEqual([]);
  });

  it('E3 loan: limit 30 000, interest 3 000, fee 500, total 33 500 in two installments of 16 750', () => {
    const limit = loanLimit({
      loanLimitFactorPermille: 1_000,
      contributionsPaidThisCycle: 30_000,
      outstandingPrincipal: 0,
      availableForLoans: 100_000,
      feeSchedule: MOCK_FEE_SCHEDULE,
    });
    expect(limit.limit).toBe(30_000);
    const quote = loanQuote({
      principal: 30_000,
      months: 2,
      loanRatePermille: 50,
      loanMaxMonths: 3,
      feeSchedule: MOCK_FEE_SCHEDULE,
      limit: limit.limit,
      installmentDueAts: [round4.dueAt, round5.dueAt],
    });
    expect(quote).toMatchObject({ ok: true, interest: 3_000, feeEstimate: 500, totalDue: 33_500 });
    expect(quote.ok && quote.installments).toEqual([
      { number: 1, amount: 16_750, dueAt: round4.dueAt },
      { number: 2, amount: 16_750, dueAt: round5.dueAt },
    ]);
    const loan = e3Loan();
    expect(loan.postings).toEqual([
      { account: 'receivable:member:M7', amount: 33_500 },
      { account: 'fund:general', amount: -3_000 },
      { account: 'cash:provider', amount: -30_500 },
    ]);
    // M7 receives the principal; the 500 fee is the rest of the cash out.
    expect(-loan.postings[2]!.amount - 500).toBe(30_000);
  });

  it('E4 late payment: fine 1 000, then 12 000 at once with shares 84, 8, 8', () => {
    const fines = roundLateFines({
      lateFine: 1_000,
      members: [
        {
          membershipId: 'M5',
          obligations: [{ kind: 'CONTRIBUTION', status: 'DUE', onTimeIntentInProgress: false }],
        },
      ],
    });
    expect(fines).toEqual([{ membershipId: 'M5', amount: 1_000 }]);
    expect(fineAssessedPostings(fines[0]!)).toEqual([
      { account: 'receivable:member:M5', amount: 1_000 },
      { account: 'fund:general', amount: -1_000 },
    ]);
    const ob = (
      id: string,
      kind: OpenObligation['kind'],
      amount: number,
      creditor: string | null,
    ): OpenObligation => ({
      id,
      kind,
      membershipId: 'M5',
      amount,
      dueAt: round4.dueAt,
      roundId: 'r4',
      roundNumber: 4,
      creditorMembershipId: creditor,
      status: 'DUE',
      inPendingPayment: false,
    });
    const payment = preparePayment({
      payerMembershipId: 'M5',
      obligations: [
        ob('c4', 'CONTRIBUTION', 10_000, 'M7'),
        ob('s4', 'SOLIDARITY', 1_000, null),
        ob('f4', 'FINE', 1_000, null),
      ],
    });
    expect(payment).toMatchObject({ ok: true, total: 12_000 });
    if (!payment.ok) return;
    const { postings, parts } = paymentReceivedPostings({
      payerMembershipId: 'M5',
      fee: 100,
      parts: payment.parts,
    });
    expect(parts.map((p) => p.feeShare)).toEqual([84, 8, 8]);
    expect(postings).toEqual([
      { account: 'cash:provider', amount: 11_900 },
      { account: 'payable:member:M7', amount: -9_916 },
      { account: 'fund:solidarity', amount: -992 },
      { account: 'receivable:member:M5', amount: -1_000 },
      { account: 'fund:general', amount: 8 },
    ]);
  });

  it('E5 payout with deductions: no fine on the covered installment, 81 340 left, 80 840 to withdraw, then 0', () => {
    const fine = { id: 'f7', kind: 'FINE' as const, amount: 1_000, dueAt: round4.dueAt };
    const installment1 = {
      id: 'i1',
      kind: 'LOAN_INSTALLMENT' as const,
      amount: 16_750,
      dueAt: round4.dueAt,
    };
    const installment2 = {
      id: 'i2',
      kind: 'LOAN_INSTALLMENT' as const,
      amount: 16_750,
      dueAt: round5.dueAt,
    };
    // At dueAt nine members have paid; M7 is late and fined, its locked payout covers installment 1.
    expect(
      installmentFine({
        lateFine: 1_000,
        installment: { ...installment1, status: 'DUE', onTimeIntentInProgress: false },
        borrowerIsRoundBeneficiary: true,
        lockedPayout: 9 * 9_909,
        otherDueDebts: [fine],
      }),
    ).toEqual({ fined: false, reason: 'COVERED_BY_LOCKED_PAYOUT' });
    const settlement = autoSettlement({
      payableBalance: 99_090,
      debts: [installment2, installment1, fine],
      now: round4.payoutAt,
    });
    expect(settlement.total).toBe(17_750);
    expect(settlement.remainingPayable).toBe(81_340);
    const withdrawal = validateWithdrawal({
      amount: 'ALL',
      payableBalance: settlement.remainingPayable,
      credits: [{ amount: 99_090, payoutAt: round4.payoutAt }],
      feeSchedule: MOCK_FEE_SCHEDULE,
      now: round4.payoutAt,
      hold: null,
      reconciliationStatus: 'OK',
      withdrawalInProgress: false,
      hasActivePaymentNumber: true,
    });
    expect(withdrawal).toEqual({ ok: true, amount: 80_840, feeEstimate: 500, available: 80_840 });
    // The same story in the ledger, which must stay sound at every step.
    const txs = chainOf([
      ...seedFund(40_000),
      e3Loan(),
      ...MEMBERS.map(payRound4),
      entry('FINE_ASSESSED', fineAssessedPostings({ membershipId: 'M7', amount: 1_000 })),
      entry(
        'AUTO_SETTLEMENT',
        autoSettlementPostings({ membershipId: 'M7', amount: settlement.total }),
      ),
      entry(
        'WITHDRAWAL_COMPLETED',
        withdrawalCompletedPostings({
          membershipId: 'M7',
          amount: 80_840,
          feeEstimated: 500,
          feeActual: 500,
        }),
      ),
    ]);
    expect(checkLedger(TEST_GROUP, txs)).toEqual([]);
    const summary = summarizeBalances(computeBalances(txs));
    expect(summary.payableByMember.M7).toBe(0);
    expect(summary.receivableByMember.M7).toBe(16_750);
  });

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
    const loanToM10 = entry(
      'LOAN_DISBURSED',
      loanDisbursedPostings({
        membershipId: 'M10',
        principal: 30_000,
        interest: 3_000,
        feeEstimated: 500,
        feeActual: 500,
      }),
    );
    const before = [...seedFund(67_503), loanToM10];
    const summary = summarizeBalances(computeBalances(before));
    expect(summary.generalFund - summary.receivables).toBe(37_003);
    const result = fundDistribution({
      distributeFundAtCycleEnd: true,
      generalFundBalance: summary.generalFund,
      outstandingReceivables: summary.receivables,
      availableForLoans: availableForLoans({ summary, inFlightDisbursements: 0 }),
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
    expect(availableForLoans({ summary: after, inFlightDisbursements: 0 })).toBe(4);
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
          parts: [{ kind: 'SHORTFALL', amount: 1_667, creditorMembershipId: 'M6' }],
        }).postings,
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
