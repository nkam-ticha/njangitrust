// Disbursements in flight in the property-based simulator (D18.1): every payout is sent first
// (DISBURSEMENT_SENT), then completed with an actual fee below, at or above the estimate (R4.3), or
// returned when the provider fails (DISBURSEMENT_RETURNED). Some stay in flight until the next step
// of the round; a returned withdrawal is auto-settled at once (M1). Later, the operator may reverse a
// completed one (DISBURSEMENT_REFUNDED, D22.1), keeping its fee or not.

import {
  completionType,
  disbursementCompletedPostings,
  disbursementRefundedPostings,
  disbursementReturnedPostings,
  loanRefundSettlement,
  planClawbackReleases,
  type DisbursementPurpose,
  type DisbursementSentMetadata,
  type LedgerTransaction,
  type Posting,
} from '../index';
import type { GroupSimulator, SimCompleted, SimPending } from './group-simulator.test-support';

/** R4.3: the provider's actual fee; above the estimate only when the general fund can absorb it. */
export function actualFee(
  sim: GroupSimulator,
  estimate: number,
  seed: number,
  headroom: number,
): number {
  if (seed % 4 === 0) return Math.max(0, estimate - 100);
  if (seed % 4 === 1 && headroom >= 100) {
    sim.counters.feeAboveEstimate += 1;
    return estimate + 100;
  }
  return estimate;
}

/** D18.1: posts the send; the provider answers now or later (`decide`). */
export function send(
  sim: GroupSimulator,
  purpose: DisbursementPurpose,
  member: string,
  operationId: string,
  lines: { postings: Posting[]; metadata: DisbursementSentMetadata },
): SimPending {
  const sent = sim.append('DISBURSEMENT_SENT', lines, {
    membershipId: member,
    refType: 'DISBURSEMENT',
    refId: operationId,
  });
  const op: SimPending = {
    sent,
    purpose,
    member,
    operationId,
    amount: lines.metadata.amount,
    feeEstimated: lines.metadata.feeEstimated,
  };
  sim.pending.push(op);
  return op;
}

/** The provider pays out, or fails for lack of balance (a reversal may have taken the money back). */
function complete(sim: GroupSimulator, op: SimPending, seed: number): boolean {
  const feeActual = actualFee(sim, op.feeEstimated, seed, sim.available());
  if (sim.summary().cash < op.amount + feeActual) return false;
  const completed = sim.append(
    completionType(op.purpose),
    disbursementCompletedPostings({
      operationId: op.operationId,
      amount: op.amount,
      feeEstimated: op.feeEstimated,
      feeActual,
      feeSource: 'PROVIDER',
    }),
    { membershipId: op.member, refType: 'DISBURSEMENT', refId: op.operationId },
  );
  sim.completed.push({ ...op, completed, refunded: false });
  return true;
}

/**
 * Q1, Q3: the releases the return or refund `returned` requires, sealed right after it. A clawback
 * debt still DUE is cancelled first (its CORRECTION obligation replaced by what is left); one already
 * paid is credited back to the payable, then auto-settled (R5.3).
 */
function postReleases(sim: GroupSimulator, returned: LedgerTransaction): number {
  const debtOf = (clawbackSeq: number) =>
    sim.obligations.find(
      (o) => o.kind === 'CORRECTION' && o.txSeq === clawbackSeq && o.status === 'DUE',
    );
  const plan = planClawbackReleases({
    ledger: sim.chain,
    returned,
    debtUnpaid: (seq) => debtOf(seq) !== undefined,
  });
  const credited = new Set<string>();
  for (const r of plan) {
    sim.append(
      r.type,
      { postings: r.postings, metadata: r.metadata },
      { membershipId: r.membershipId },
    );
    sim.counters.clawbackReleased += 1;
    if (r.fromDebt > 0) {
      const debt = debtOf(r.metadata.clawbackSeq)!;
      debt.status = 'CANCELLED';
      if (r.debtLeft > 0)
        sim.obligations.push({
          ...debt,
          id: sim.nextId('corr'),
          amount: r.debtLeft,
          status: 'DUE',
        });
    }
    if (r.toPayable > 0) {
      sim.counters.releaseToPayable += 1;
      credited.add(r.membershipId);
    }
  }
  for (const m of credited) sim.settle(m);
  return plan.length;
}

function fail(sim: GroupSimulator, op: SimPending): void {
  const returned = sim.append(
    'DISBURSEMENT_RETURNED',
    {
      postings: disbursementReturnedPostings(op.sent.postings),
      metadata: { sentSeq: op.sent.seq },
    },
    { membershipId: op.member, refType: 'DISBURSEMENT', refId: op.operationId },
  );
  sim.counters.returned += 1;
  if (op.purpose === 'SOLIDARITY' && postReleases(sim, returned) > 0)
    sim.counters.releaseAfterReturn += 1;
  if (op.purpose === 'WITHDRAWAL') sim.settle(op.member); // M1: the payable was credited back
  if (op.purpose === 'LOAN') {
    for (const o of sim.obligations)
      if (o.loanOp === op.operationId && o.status === 'DUE') o.status = 'CANCELLED';
    sim.closeRepaidLoan(op.member);
  }
}

/**
 * The provider's answer for one operation: success (most often) or failure. A solidarity payout
 * whose absence made a clawback necessary fails more often, so Q1 releases run regularly.
 */
function answer(sim: GroupSimulator, op: SimPending, seed: number): void {
  sim.pending = sim.pending.filter((p) => p !== op);
  const clawedSince =
    op.purpose === 'SOLIDARITY' &&
    sim.chain.some(
      (t) =>
        t.type === 'CLAWBACK' &&
        t.seq > op.sent.seq &&
        t.postings.some((p) => p.account === 'fund:solidarity'),
    );
  const fails = seed % 5 === 4 || (clawedSince && seed % 2 === 0);
  if (fails || !complete(sim, op, seed)) fail(sim, op);
}

/** Right after a send: answered at once, or left in flight until the next step of the round. */
export function decide(sim: GroupSimulator, op: SimPending, seed: number): void {
  if ((seed >> 3) % 2 === 0) {
    sim.counters.keptInFlight += 1;
    return;
  }
  answer(sim, op, seed);
}

/** Every operation still in flight gets its answer (the provider answers within the round). */
export function resolvePending(sim: GroupSimulator, seed: number): void {
  for (const op of [...sim.pending]) {
    sim.counters.completedLater += 1;
    answer(sim, op, seed + op.sent.seq);
  }
  if (seed % 8 === 1) refundOne(sim, seed >> 3);
}

/**
 * D22.1: whether the operator's reversal can be recorded as the ledger stands. Owner Q2 and Q3 are
 * decided: loans with installments repaid and solidarity payouts already clawed back are refunded
 * too. Loans waiting for next-cycle installments are left alone so the D18.2 re-dating keeps running.
 */
function refundable(sim: GroupSimulator, c: SimCompleted): boolean {
  if (c.refunded) return false;
  if (c.purpose === 'LOAN')
    return !sim.obligations.some(
      (o) => o.loanOp === c.operationId && o.status === 'DUE' && o.nextCycle !== undefined,
    );
  return true;
}

/**
 * D22.1: the operator reverses a completed disbursement, sometimes keeping its fee (borne by the
 * general fund). Q2: a loan's repaid installments go back to the borrower's payable, the unpaid ones
 * are cancelled. Q3: a solidarity payout releases its clawbacks. The simulator keeps it within what
 * the fund can absorb, so coverage holds.
 */
export function refundOne(sim: GroupSimulator, seed: number): boolean {
  const candidates = sim.completed.filter((c) => refundable(sim, c));
  // Q2 is rare (installments are monthly): half the time, a loan already partly repaid goes first.
  const repaid = candidates.filter(
    (c) =>
      c.purpose === 'LOAN' &&
      sim.obligations.some(
        (o) => o.loanOp === c.operationId && (o.status === 'PAID' || o.status === 'SETTLED'),
      ),
  );
  const pool = (seed >> 4) % 2 === 0 && repaid.length > 0 ? repaid : candidates;
  const c = pool[seed % Math.max(1, pool.length)];
  if (!c) return false;
  const feeActual = c.completed.metadata.feeActual as number;
  let paidBack = 0;
  let cancel: string[] = [];
  if (c.purpose === 'LOAN') {
    const installments = sim.obligations.filter((o) => o.loanOp === c.operationId);
    const settlement = loanRefundSettlement({
      totalDue: c.amount + (c.sent.metadata.interest as number) + c.feeEstimated,
      installments,
    });
    if (!settlement.ok) return false;
    paidBack = settlement.paidBack;
    cancel = settlement.cancelInstallmentIds;
  }
  // Coverage: cash comes back (amount + feeActual − feeKept); reserved money grows by what the send
  // took from it (payable or solidarity fund: amount + feeEstimated) or, for a loan, by paidBack.
  const needs = (kept: number) =>
    c.purpose === 'LOAN'
      ? Math.max(0, paidBack + kept - c.amount - feeActual)
      : Math.max(0, c.feeEstimated + kept - feeActual);
  let feeKept = (seed >> 2) % 2 === 0 ? feeActual : 0;
  if (sim.available() < needs(feeKept)) feeKept = 0;
  if (sim.available() < needs(feeKept)) return false;
  const refund = sim.append(
    'DISBURSEMENT_REFUNDED',
    disbursementRefundedPostings({
      sent: c.sent,
      completed: c.completed,
      completedSeq: c.completed.seq,
      feeKept,
      ...(c.purpose === 'LOAN' ? { paidBack } : {}),
    }),
    { membershipId: c.member, refType: 'DISBURSEMENT', refId: c.operationId },
  );
  c.refunded = true;
  sim.counters.refunded += 1;
  if (feeKept > 0) sim.counters.refundFeeKept += 1;
  if (c.purpose === 'SOLIDARITY' && postReleases(sim, refund) > 0)
    sim.counters.releaseAfterRefund += 1;
  if (c.purpose === 'WITHDRAWAL') sim.settle(c.member); // M1: the payable was credited back
  if (c.purpose === 'LOAN') {
    for (const o of sim.obligations) if (cancel.includes(o.id)) o.status = 'CANCELLED';
    if (paidBack > 0) {
      sim.counters.loanRefundPaidBack += 1;
      sim.settle(c.member); // R5.3: the payable was credited
    }
    sim.closeRepaidLoan(c.member);
  }
  return true;
}
