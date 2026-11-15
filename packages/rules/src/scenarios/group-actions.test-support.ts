// Money actions of the property-based simulator: withdrawals (R5.4), loans (R7, D16.3, D18.2), exits
// (R12.3, D13.4), solidarity payouts (R10) and the cycle-end distribution (R9.3). Every payout is sent
// first and completed or returned later (D18.1, group-payouts.test-support.ts).

import {
  autoSettlementPostings,
  exitSettlement,
  fundDistribution,
  fundDistributionPostings,
  leaverRefundPostings,
  loanEligibility,
  loanLimit,
  loanQuote,
  loanSentPostings,
  MOCK_FEE_SCHEDULE,
  removeFromRotation,
  selectInstallmentsForRepayment,
  solidaritySentPostings,
  validateLoanDisbursement,
  validateSolidarityDisbursement,
  validateSolidarityRequest,
  validateWithdrawal,
  withdrawalSentPostings,
} from '../index';
import { decide, send } from './group-payouts.test-support';
import { NOT_YET, type GroupSimulator } from './group-simulator.test-support';

const pick = <T>(list: readonly T[], seed: number): T | undefined =>
  list.length ? list[seed % list.length] : undefined;

/** R5.4, R5.5, D13.3, M1: withdraw everything or a part of what is available. */
export function withdraw(sim: GroupSimulator, seed: number): boolean {
  const m = pick(sim.everyone, seed)!;
  const result = validateWithdrawal({
    amount: seed % 3 === 0 ? 'ALL' : 100 + (seed % 60_000),
    payableBalance: sim.payable(m),
    credits: sim.credits.filter((c) => c.membershipId === m),
    feeSchedule: MOCK_FEE_SCHEDULE,
    now: sim.now(),
    hold: null,
    reconciliationStatus: sim.reconciliationStatus(),
    withdrawalInProgress: sim.withdrawalInProgress(m),
    hasActivePaymentNumber: true,
    debts: sim.dueDebts(m),
  });
  if (!result.ok) return false;
  const operationId = sim.nextId('w');
  const op = send(
    sim,
    'WITHDRAWAL',
    m,
    operationId,
    withdrawalSentPostings({
      operationId,
      membershipId: m,
      amount: result.amount,
      feeEstimated: result.feeEstimate,
    }),
  );
  decide(sim, op, seed);
  return true;
}

/** R7.1–R7.5, D16.3, D18.2: a loan within the member's limit, repaid in monthly installments. */
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
      (o.status === 'PAID' || o.status === 'SETTLED') &&
      o.cycle === sim.cycle,
  );
  const available = sim.available();
  const { limit } = loanLimit({
    loanLimitFactorPermille: sim.params.loanLimitFactorPermille,
    contributionsPaidThisCycle: paid.reduce((s, o) => s + o.amount, 0),
    outstandingPrincipal: 0,
    availableForLoans: available,
    feeSchedule: MOCK_FEE_SCHEDULE,
  });
  if (limit < 1) return false;
  const quote = loanQuote({
    principal: 1 + (seed % limit),
    months,
    loanRatePermille: sim.params.loanRatePermille,
    loanMaxMonths: sim.params.loanMaxMonths,
    feeSchedule: MOCK_FEE_SCHEDULE,
    limit,
    approvedAt: now,
    frequency: sim.schedule.frequency,
    rounds: sim.cycleRounds(),
  });
  if (!quote.ok) return false;
  const check = validateLoanDisbursement({
    loanStatus: 'APPROVED',
    principal: quote.principal,
    feeEstimate: quote.feeEstimate,
    availableForLoans: available,
    hold: null,
    reconciliationStatus: sim.reconciliationStatus(),
    hasActivePaymentNumber: true,
  });
  if (!check.ok) return false;
  const operationId = sim.nextId('loan');
  const op = send(
    sim,
    'LOAN',
    m,
    operationId,
    loanSentPostings({
      operationId,
      membershipId: m,
      principal: quote.principal,
      interest: quote.interest,
      feeEstimated: quote.feeEstimate,
    }),
  );
  for (const inst of quote.installments) {
    const dated = inst.due.status === 'DATED';
    if (!dated) sim.counters.installmentNextCycle += 1;
    sim.obligations.push({
      id: sim.nextId('inst'),
      kind: 'LOAN_INSTALLMENT',
      membershipId: m,
      amount: inst.amount,
      dueAt: inst.due.status === 'DATED' ? inst.due.dueAt : NOT_YET,
      roundId: null,
      roundNumber: sim.slot + inst.number,
      creditorMembershipId: null,
      status: 'DUE',
      inPendingPayment: false,
      cycle: sim.cycle,
      payoutAt: inst.due.status === 'DATED' ? inst.due.dueAt : NOT_YET,
      ...(dated ? {} : { nextCycle: inst.due }),
      loanOp: operationId,
    });
  }
  sim.activeLoan.add(m);
  decide(sim, op, seed);
  return true;
}

/**
 * R7.7: a borrower repays early, the next installment or everything left, by request (never an
 * installment of a loan still in flight, L2). Makes loans partly or fully repaid before an operator
 * reversal (owner Q2) as well as early repayment itself.
 */
export function repayEarly(sim: GroupSimulator, seed: number): boolean {
  const borrowers = sim.everyone.filter((m) =>
    sim.owed(m).some((o) => o.kind === 'LOAN_INSTALLMENT' && !o.loanInFlight),
  );
  const m = pick(borrowers, seed);
  if (!m) return false;
  const unpaid = sim.owed(m).filter((o) => o.kind === 'LOAN_INSTALLMENT' && !o.loanInFlight);
  const choice = selectInstallmentsForRepayment(unpaid, seed % 2 === 0 ? 'NEXT' : 'ALL');
  if (!choice.ok) return false;
  return sim.payChosen(
    m,
    unpaid.filter((o) => choice.installmentIds.includes(o.id)),
  );
}

/** R10.2, R10.3, D13.5, D18.1: a solidarity payout voted through; the recipient bears the fee. */
export function solidarityPayout(sim: GroupSimulator, seed: number): boolean {
  const fund = sim.summary().solidarityFund;
  // D18.3 rollbacks need a payout leaving a little in the fund, then a small one; the payer owes when
  // the whole fund is in flight. Otherwise any amount.
  const amounts = [fund - 501 - (seed % 400), 501 + (seed % 300), fund, 501 + (seed % 20_000)];
  // When little is left (after a large payout), half the time a small payout nearly empties it.
  const small = fund > 502 && fund <= 1_300 && (seed >> 2) % 2 === 0;
  const amount = small ? 501 + (seed % (fund - 501)) : amounts[seed % 4]!;
  const request = validateSolidarityRequest({
    amount,
    event: 'NAISSANCE',
    solidarityFundBalance: fund,
    pendingSolidarityPayouts: 0, // payouts in flight have already left the fund (D18.1)
    feeSchedule: MOCK_FEE_SCHEDULE,
    recipientIsMember: true,
  });
  if (!request.ok) return false;
  const check = validateSolidarityDisbursement({
    amount: request.amount,
    solidarityFundBalance: fund,
    feeEstimate: request.feeEstimate,
    hold: null,
    reconciliationStatus: sim.reconciliationStatus(),
    hasActivePaymentNumber: true,
  });
  if (!check.ok) return false;
  const recipient = pick(sim.everyone, seed)!;
  const operationId = sim.nextId('sol');
  const op = send(
    sim,
    'SOLIDARITY',
    recipient,
    operationId,
    solidaritySentPostings({
      operationId,
      amount: request.amount,
      feeEstimated: request.feeEstimate,
    }),
  );
  decide(sim, op, seed);
  return true;
}

/** R12.3, D13.4: a member not yet served leaves; refund, shortfall, loan balance due and settled. */
export function exitMember(sim: GroupSimulator, seed: number): boolean {
  const current = sim.beneficiary();
  const candidates =
    sim.mode === 'FIXED'
      ? sim.rotation.slice(sim.roundInCycle)
      : sim.rotation.filter((m) => !sim.served.has(m) && m !== current);
  // R12.3: the round of a not-yet-served leaver is removed; someone else must still be waiting.
  const waiting = sim.rotation.filter((x) => !sim.served.has(x) && x !== current);
  if (sim.mode === 'BIDDING' && waiting.length < 2) return false;
  const m = pick(candidates, seed);
  if (!m || sim.rotation.length <= 3 || sim.pending.some((p) => p.member === m)) return false;
  const paid = sim.obligations.filter(
    (o) =>
      o.membershipId === m &&
      o.kind === 'CONTRIBUTION' &&
      (o.status === 'PAID' || o.status === 'SETTLED') &&
      o.cycle === sim.cycle,
  );
  const remaining = removeFromRotation(sim.rotation, m);
  const installments = sim.owed(m).filter((o) => o.kind === 'LOAN_INSTALLMENT');
  const result = exitSettlement({
    served: false,
    contributionsPaidThisCycle: paid.reduce((s, o) => s + o.amount, 0),
    availableForLoans: sim.available(),
    leaverPayableBalance: sim.payable(m),
    leaverDebts: sim.dueDebts(m),
    leaverLoanInstallments: installments.map((o) => ({
      ...o,
      dueAt: o.nextCycle ? null : o.dueAt,
    })),
    remainingMembershipIds: remaining,
    nextRoundDueAt: sim.dates(sim.slot + 1).dueAt,
    now: sim.now(),
  });
  if (result.kind !== 'NOT_SERVED') return false;
  if (result.fromFund > 0) {
    sim.append('LEAVER_REFUND', leaverRefundPostings({ membershipId: m, amount: result.fromFund }));
  }
  for (const id of result.acceleratedInstallmentIds) {
    const o = sim.obligations.find((x) => x.id === id)!;
    o.dueAt = sim.now();
    delete o.nextCycle;
  }
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
  sim.closeRepaidLoan(m);
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
      outstandingDebt: summary.receivableByMember[m] ?? 0,
    })),
  });
  if (result.ok)
    sim.append('FUND_DISTRIBUTION', fundDistributionPostings({ shares: result.shares }));
}
