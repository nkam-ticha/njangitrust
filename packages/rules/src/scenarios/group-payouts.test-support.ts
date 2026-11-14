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
  type DisbursementPurpose,
  type DisbursementSentMetadata,
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

function fail(sim: GroupSimulator, op: SimPending): void {
  sim.append(
    'DISBURSEMENT_RETURNED',
    {
      postings: disbursementReturnedPostings(op.sent.postings),
      metadata: { sentSeq: op.sent.seq },
    },
    { membershipId: op.member, refType: 'DISBURSEMENT', refId: op.operationId },
  );
  sim.counters.returned += 1;
  if (op.purpose === 'WITHDRAWAL') sim.settle(op.member); // M1: the payable was credited back
  if (op.purpose === 'LOAN') {
    for (const o of sim.obligations)
      if (o.loanOp === op.operationId && o.status === 'DUE') o.status = 'CANCELLED';
    sim.closeRepaidLoan(op.member);
  }
}

/** The provider's answer for one operation: success (most often) or failure. */
function answer(sim: GroupSimulator, op: SimPending, seed: number): void {
  sim.pending = sim.pending.filter((p) => p !== op);
  if (seed % 5 === 4 || !complete(sim, op, seed)) fail(sim, op);
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
 * D22.1: whether the operator's reversal can be recorded as the ledger stands. Open owner questions
 * (handoff) keep two cases out: a loan with installments already paid, a solidarity payout already
 * partly clawed back.
 */
function refundable(sim: GroupSimulator, c: SimCompleted): boolean {
  if (c.refunded) return false;
  // Loans waiting for next-cycle installments are left alone so the D18.2 re-dating keeps running.
  if (c.purpose === 'LOAN')
    return !sim.obligations.some(
      (o) =>
        o.loanOp === c.operationId &&
        (o.status === 'PAID' || o.status === 'SETTLED' || o.nextCycle !== undefined),
    );
  if (c.purpose === 'SOLIDARITY')
    return !sim.chain.some(
      (t) => t.type === 'CLAWBACK' && t.metadata.solidarityPayoutSeq === c.completed.seq,
    );
  return true;
}

/**
 * D22.1: the operator reverses a completed disbursement, sometimes keeping its fee (borne by the
 * general fund). The simulator keeps it within what the fund can absorb, so coverage holds.
 */
export function refundOne(sim: GroupSimulator, seed: number): boolean {
  const candidates = sim.completed.filter((c) => refundable(sim, c));
  const c = candidates[seed % Math.max(1, candidates.length)];
  if (!c) return false;
  const feeActual = c.completed.metadata.feeActual as number;
  const needs = (kept: number) =>
    c.purpose === 'LOAN' ? 0 : Math.max(0, c.feeEstimated + kept - feeActual);
  let feeKept = (seed >> 2) % 2 === 0 ? feeActual : 0;
  if (sim.available() < needs(feeKept)) feeKept = 0;
  if (sim.available() < needs(feeKept)) return false;
  sim.append(
    'DISBURSEMENT_REFUNDED',
    disbursementRefundedPostings({
      sent: c.sent,
      completed: c.completed,
      completedSeq: c.completed.seq,
      feeKept,
    }),
    { membershipId: c.member, refType: 'DISBURSEMENT', refId: c.operationId },
  );
  c.refunded = true;
  sim.counters.refunded += 1;
  if (feeKept > 0) sim.counters.refundFeeKept += 1;
  if (c.purpose === 'WITHDRAWAL') sim.settle(c.member); // M1: the payable was credited back
  if (c.purpose === 'LOAN') {
    for (const o of sim.obligations)
      if (o.loanOp === c.operationId && o.status === 'DUE') o.status = 'CANCELLED';
    sim.closeRepaidLoan(c.member);
  }
  return true;
}
