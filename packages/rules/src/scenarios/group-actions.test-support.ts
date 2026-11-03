// Money actions of the property-based simulator: withdrawals (R5.4), loans (R7), exits (R12.3),
// solidarity payouts (R10), fine waivers (R6.4, REVERSAL) and the cycle-end distribution (R9.3).

import {
  exitSettlement,
  fundDistribution,
  fundDistributionPostings,
  leaverRefundPostings,
  loanDisbursedPostings,
  loanEligibility,
  loanLimit,
  loanQuote,
  MOCK_FEE_SCHEDULE,
  removeFromRotation,
  reversalPostings,
  solidarityDisbursedPostings,
  validateSolidarityRequest,
  validateWithdrawal,
  withdrawalCompletedPostings,
  autoSettlementPostings,
} from '../index';
import type { GroupSimulator } from './group-simulator.test-support';

const pick = <T>(list: readonly T[], seed: number): T | undefined =>
  list.length ? list[seed % list.length] : undefined;

/** R5.4, R5.5, R4.3: withdraw everything or a part; the actual fee may come in lower than estimated. */
export function withdraw(sim: GroupSimulator, seed: number): boolean {
  const m = pick(sim.everyone, seed)!;
  const result = validateWithdrawal({
    amount: seed % 3 === 0 ? 'ALL' : 100 + (seed % 60_000),
    payableBalance: sim.payable(m),
    credits: sim.credits.filter((c) => c.membershipId === m),
    feeSchedule: MOCK_FEE_SCHEDULE,
    now: sim.now(),
    hold: null,
    reconciliationStatus: 'OK',
    withdrawalInProgress: false,
    hasActivePaymentNumber: true,
  });
  if (!result.ok) return false;
  const feeActual = seed % 4 === 0 ? result.feeEstimate - 100 : result.feeEstimate;
  sim.append(
    'WITHDRAWAL_COMPLETED',
    withdrawalCompletedPostings({
      membershipId: m,
      amount: result.amount,
      feeEstimated: result.feeEstimate,
      feeActual,
    }),
  );
  return true;
}

/** R7.1–R7.3: a loan within the member's limit, repaid over the next rounds. */
export function borrow(sim: GroupSimulator, seed: number, months: number): boolean {
  const m = pick(sim.rotation, seed)!;
  const now = sim.now();
  const eligible = loanEligibility({
    membershipStatus: 'ACTIVE',
    hasActiveLoan: sim.activeLoan.has(m),
    unpaidDebts: sim.dueDebts(m),
    now,
  });
  if (!eligible.ok) return false;
  const paid = sim.obligations.filter(
    (o) =>
      o.membershipId === m &&
      o.kind === 'CONTRIBUTION' &&
      o.status !== 'DUE' &&
      o.status !== 'CANCELLED' &&
      o.cycle === sim.cycle,
  );
  const { limit } = loanLimit({
    loanLimitFactorPermille: sim.params.loanLimitFactorPermille,
    contributionsPaidThisCycle: paid.reduce((s, o) => s + o.amount, 0),
    outstandingPrincipal: 0,
    availableForLoans: sim.available(),
    feeSchedule: MOCK_FEE_SCHEDULE,
  });
  if (limit < 100) return false;
  const quote = loanQuote({
    principal: 100 + (seed % (limit - 99)),
    months,
    loanRatePermille: sim.params.loanRatePermille,
    loanMaxMonths: sim.params.loanMaxMonths,
    feeSchedule: MOCK_FEE_SCHEDULE,
    limit,
    installmentDueAts: Array.from({ length: months }, (_, k) => sim.dates(sim.slot + k + 1).dueAt),
  });
  if (!quote.ok) return false;
  sim.append(
    'LOAN_DISBURSED',
    loanDisbursedPostings({
      membershipId: m,
      principal: quote.principal,
      interest: quote.interest,
      feeEstimated: quote.feeEstimate,
      feeActual: quote.feeEstimate,
    }),
  );
  for (const inst of quote.installments) {
    sim.obligations.push({
      id: sim.nextId('inst'),
      kind: 'LOAN_INSTALLMENT',
      membershipId: m,
      amount: inst.amount,
      dueAt: inst.dueAt,
      roundId: null,
      roundNumber: sim.slot + inst.number,
      creditorMembershipId: null,
      status: 'DUE',
      inPendingPayment: false,
      cycle: sim.cycle,
      payoutAt: inst.dueAt,
    });
  }
  sim.activeLoan.add(m);
  return true;
}

/** R12.3: a member not yet served leaves; refund from the fund, shortfall shared, debts settled. */
export function exitMember(sim: GroupSimulator, seed: number): boolean {
  const candidates = sim.rotation.slice(sim.roundInCycle);
  const m = pick(candidates, seed);
  if (!m || sim.rotation.length <= 3) return false;
  const paid = sim.obligations.filter(
    (o) =>
      o.membershipId === m &&
      o.kind === 'CONTRIBUTION' &&
      o.status !== 'DUE' &&
      o.status !== 'CANCELLED' &&
      o.cycle === sim.cycle,
  );
  const remaining = removeFromRotation(sim.rotation, m);
  const result = exitSettlement({
    served: false,
    contributionsPaidThisCycle: paid.reduce((s, o) => s + o.amount, 0),
    availableForLoans: sim.available(),
    leaverPayableBalance: sim.payable(m),
    leaverDebts: sim.dueDebts(m),
    remainingMembershipIds: remaining,
    nextRoundDueAt: sim.dates(sim.slot + 1).dueAt,
    now: sim.now(),
  });
  if (result.kind !== 'NOT_SERVED') return false;
  if (result.fromFund > 0)
    sim.append('LEAVER_REFUND', leaverRefundPostings({ membershipId: m, amount: result.fromFund }));
  if (result.settlement.total > 0) {
    sim.append(
      'AUTO_SETTLEMENT',
      autoSettlementPostings({ membershipId: m, amount: result.settlement.total }),
    );
    for (const d of result.settlement.settled)
      sim.obligations.find((o) => o.id === d.id)!.status = 'SETTLED';
  }
  for (const o of sim.owed(m))
    if (o.kind === 'CONTRIBUTION' || o.kind === 'SOLIDARITY') o.status = 'CANCELLED';
  for (const s of result.shortfallShares) {
    sim.obligations.push({
      id: sim.nextId('short'),
      kind: 'SHORTFALL_SHARE',
      membershipId: s.membershipId,
      amount: s.amount,
      dueAt: s.dueAt,
      roundId: null,
      roundNumber: sim.slot,
      creditorMembershipId: m,
      status: 'DUE',
      inPendingPayment: false,
      cycle: sim.cycle,
      payoutAt: s.dueAt,
    });
  }
  sim.rotation = remaining;
  return true;
}

/** R10.2, R10.3: a solidarity payout voted through; the recipient bears the fee. */
export function solidarityPayout(sim: GroupSimulator, seed: number): boolean {
  const result = validateSolidarityRequest({
    amount: 600 + (seed % 20_000),
    event: 'NAISSANCE',
    solidarityFundBalance: sim.summary().solidarityFund,
    pendingSolidarityPayouts: 0,
    feeSchedule: MOCK_FEE_SCHEDULE,
    recipientIsMember: true,
  });
  if (!result.ok) return false;
  sim.append(
    'SOLIDARITY_DISBURSED',
    solidarityDisbursedPostings({
      amount: result.amount,
      feeEstimated: result.feeEstimate,
      feeActual: result.feeEstimate,
    }),
  );
  return true;
}

/** R6.4, R11.1 FINE_WAIVER: an unpaid fine is reversed. */
export function waiveFine(sim: GroupSimulator, seed: number): boolean {
  const fines = sim.obligations.filter(
    (o) => o.kind === 'FINE' && o.status === 'DUE' && o.txSeq !== undefined,
  );
  const fine = pick(fines, seed);
  if (!fine) return false;
  const original = sim.chain[fine.txSeq! - 1]!;
  sim.append('REVERSAL', reversalPostings(original.postings), {
    refType: 'LEDGER_TRANSACTION',
    refId: original.id,
    metadata: { reversesSeq: original.seq },
  });
  fine.status = 'CANCELLED';
  return true;
}

/** R9.3: at cycle end, members active all cycle with no debt share the collected fund. */
export function distributeFund(sim: GroupSimulator): void {
  const summary = sim.summary();
  const result = fundDistribution({
    distributeFundAtCycleEnd: sim.params.distributeFundAtCycleEnd,
    generalFundBalance: summary.generalFund,
    outstandingReceivables: summary.receivables,
    availableForLoans: sim.available(),
    candidates: sim.rotation.map((m) => ({
      membershipId: m,
      activeWholeCycle: true,
      outstandingDebt: sim.obligations
        .filter(
          (o) =>
            o.membershipId === m &&
            o.status === 'DUE' &&
            ['FINE', 'BID', 'LOAN_INSTALLMENT'].includes(o.kind),
        )
        .reduce((s, o) => s + o.amount, 0),
    })),
  });
  if (result.ok)
    sim.append('FUND_DISTRIBUTION', fundDistributionPostings({ shares: result.shares }));
}
