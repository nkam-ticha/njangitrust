// Corrections in the property-based simulator: a fine waiver (R6.4, REVERSAL) and a payment the
// provider reversed (2.5 REVERSAL) after its money was paid out, possibly while payouts are in
// flight: POT_CORRECTION and CLAWBACK first (planReversalCorrections, from ledger balances only),
// what is missing becoming the recipient's debt (D15, D16.1), a solidarity shortfall rolled back
// over the latest payouts and finally the payer (D18.3), then the exact REVERSAL. Coverage may break
// (D16.2); the simulator then pauses disbursements until the debts are paid.

import {
  applyPostings,
  computeBalances,
  negativeAccounts,
  planReversalCorrections,
  reservedShortfall,
  reversalPostings,
  summarizeBalances,
} from '../index';
import type { GroupSimulator } from './group-simulator.test-support';

const pick = <T>(list: readonly T[], seed: number): T | undefined =>
  list.length ? list[seed % list.length] : undefined;

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

/** The debt a correction created for its member (D15, D16.1), due now like a fine. */
function recordDebt(
  sim: GroupSimulator,
  membershipId: string,
  amount: number,
  txSeq: number,
): void {
  sim.obligations.push({
    id: sim.nextId('corr'),
    kind: 'CORRECTION',
    membershipId,
    amount,
    dueAt: sim.now(),
    roundId: null,
    roundNumber: sim.slot,
    creditorMembershipId: null,
    status: 'DUE',
    inPendingPayment: false,
    cycle: sim.cycle,
    payoutAt: sim.now(),
    txSeq,
  });
}

/**
 * 2.5 REVERSAL of a payment the provider took back. Skipped only when provider cash itself would go
 * below zero (the provider cannot take back more than the account holds).
 */
export function reversePayment(sim: GroupSimulator, seed: number): boolean {
  const payment = pick(
    sim.payments.filter((p) => !p.reversed),
    seed,
  );
  if (!payment) return false;
  const balancesBefore = computeBalances(sim.chain);
  const plan = planReversalCorrections({ original: payment.tx, ledger: sim.chain });
  const reversal = reversalPostings(payment.tx.postings);
  let balances = balancesBefore;
  for (const c of plan) balances = applyPostings(balances, c.postings);
  balances = applyPostings(balances, reversal);
  if (negativeAccounts(balances).length > 0) return false;
  if (plan.length > 0 && sim.pending.length > 0) sim.counters.correctionWithInFlight += 1;
  const fromFund = plan.filter((c) => c.postings.some((p) => p.account === 'fund:solidarity'));
  if (fromFund.length > 0) sim.counters.solidarityClawback += 1;
  if (fromFund.filter((c) => c.metadata.solidarityPayoutSeq !== null).length > 1)
    sim.counters.solidarityRollback += 1;
  if (fromFund.some((c) => c.metadata.solidarityPayoutSeq === null)) sim.counters.payerOwes += 1;
  for (const c of plan) {
    const tx = sim.append(
      c.type,
      { postings: c.postings, metadata: c.metadata },
      { membershipId: c.membershipId },
    );
    const debt = c.postings.find((p) => p.account.startsWith('receivable:'))?.amount ?? 0;
    const fromPayable = c.postings.find((p) => p.account.startsWith('payable:'));
    if (c.type === 'POT_CORRECTION') {
      sim.counters.potCorrection += 1;
      const credit = sim.credits.find(
        (k) =>
          k.membershipId === c.membershipId &&
          k.paymentSeq === null &&
          k.amount >= (fromPayable?.amount ?? 0),
      );
      if (credit) credit.amount -= fromPayable?.amount ?? 0;
    } else {
      sim.counters.clawback += 1;
    }
    if (debt > 0) {
      recordDebt(sim, c.membershipId, debt, tx.seq);
      sim.counters.correctionDebt += 1;
    }
  }
  sim.append('REVERSAL', reversal, {
    refType: 'LEDGER_TRANSACTION',
    refId: payment.tx.id,
    metadata: { reversesSeq: payment.tx.seq },
  });
  payment.reversed = true;
  sim.counters.reversal += 1;
  if (reservedShortfall(summarizeBalances(balances)) > 0) sim.counters.coverageBroken += 1;
  sim.credits = sim.credits.filter((k) => k.paymentSeq !== payment.tx.seq);
  for (const part of payment.parts) {
    const ob = sim.obligations.find((o) => o.id === part.ref);
    if (ob) ob.status = 'DUE';
  }
  sim.closeRepaidLoan(payment.payer);
  return true;
}
