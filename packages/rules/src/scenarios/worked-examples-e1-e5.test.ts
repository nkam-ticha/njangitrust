// Spec 3.17: worked examples E1 to E5, end to end through the rules and the ledger. They must pass
// to the franc. Group of 10 members M1 to M10, contribution 10 000, solidarity 1 000, fixture fees
// 100 per collection and 500 per disbursement.

import { describe, expect, it } from 'vitest';
import {
  autoSettlement,
  autoSettlementPostings,
  checkLedger,
  computeBalances,
  fineAssessedPostings,
  installmentFine,
  loanLimit,
  loanQuote,
  MOCK_FEE_SCHEDULE,
  paymentReceivedPostings,
  preparePayment,
  resolvePaymentParts,
  roundDates,
  roundLateFines,
  summarizeBalances,
  sumsToZero,
  validateWithdrawal,
  type OpenObligation,
} from '../index';
import { chainOf, entry, paidOut, seedFund, TEST_GROUP } from '../ledger/ledger.test-support';
import {
  e3Loan,
  MEMBERS,
  payRound4,
  round4,
  round4Parts,
  round5,
  schedule,
} from './worked-examples.test-support';

describe('3.17 worked examples E1 to E5', () => {
  it('E1 fee split on one payment: 91 and 9; postings +10 900, −9 909, −991', () => {
    const { postings, parts } = paymentReceivedPostings({
      payerMembershipId: 'M3',
      fee: 100,
      feeSource: 'SCHEDULE',
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
      // Quoted on 10 January 2027, during round 3 (payout 30 January): R7.3 gives rounds 4 and 5.
      approvedAt: new Date('2027-01-10T09:00:00.000Z'),
      frequency: 'MONTHLY',
      rounds: Array.from({ length: 8 }, (_, i) => roundDates(schedule, i + 1)),
    });
    expect(quote).toMatchObject({ ok: true, interest: 3_000, feeEstimate: 500, totalDue: 33_500 });
    expect(quote.ok && quote.installments).toEqual([
      { number: 1, amount: 16_750, due: { status: 'DATED', dueAt: round4.dueAt } },
      { number: 2, amount: 16_750, due: { status: 'DATED', dueAt: round5.dueAt } },
    ]);
    const [sent, done] = e3Loan();
    // D18.1: booked when sent, P + fee in flight; the completion pays it out from there.
    expect(sent!.postings).toEqual([
      { account: 'receivable:member:M7', amount: 33_500 },
      { account: 'fund:general', amount: -3_000 },
      { account: 'inflight:disbursement:e3-loan', amount: -30_500 },
    ]);
    expect(done!.postings).toEqual([
      { account: 'inflight:disbursement:e3-loan', amount: 30_500 },
      { account: 'cash:provider', amount: -30_500 },
    ]);
    // Together, exactly spec 3.17 E3: receivable +33 500, fund −3 000, cash −30 500.
    const net = [...computeBalances([sent!, done!])].filter(([, v]) => v !== 0);
    expect(Object.fromEntries(net)).toEqual({
      'receivable:member:M7': 33_500,
      'fund:general': -3_000,
      'cash:provider': -30_500,
    });
    // M7 receives the principal; the 500 fee is the rest of the cash out.
    expect(sent!.metadata).toMatchObject({ purpose: 'LOAN', amount: 30_000, feeEstimated: 500 });
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
      feeSource: 'SCHEDULE',
      parts: resolvePaymentParts(payment.parts, {
        beneficiaryOfRound: () => 'M7',
        rotationPosition: (m) => Number(m.slice(1)),
      }),
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
      debts: settlement.notCovered,
    });
    expect(withdrawal).toEqual({ ok: true, amount: 80_840, feeEstimate: 500, available: 80_840 });
    // The same story in the ledger, which must stay sound at every step.
    const txs = chainOf([
      ...seedFund(40_000),
      ...e3Loan(),
      ...MEMBERS.map(payRound4),
      entry('FINE_ASSESSED', fineAssessedPostings({ membershipId: 'M7', amount: 1_000 })),
      entry(
        'AUTO_SETTLEMENT',
        autoSettlementPostings({ membershipId: 'M7', amount: settlement.total }),
      ),
      ...paidOut('WITHDRAWAL', 'M7', 80_840),
    ]);
    expect(checkLedger(TEST_GROUP, txs)).toEqual([]);
    const summary = summarizeBalances(computeBalances(txs));
    expect(summary.payableByMember.M7).toBe(0);
    expect(summary.receivableByMember.M7).toBe(16_750);
  });
});
