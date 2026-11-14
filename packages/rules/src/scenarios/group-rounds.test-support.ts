// Round progression of the simulator: fines at dueAt (R6.1, R6.2), the bidding close with its
// published result and pot (R8.3, M3, D10), auto-settlement at payoutAt (R5.3), then the next round
// or cycle, where installments waiting for it are re-dated (D18.2). Payouts in flight get their
// provider answer at each step (D18.1).

import {
  addHours,
  bidAssessedPostings,
  closeBidding,
  fineAssessedPostings,
  genesisHash,
  installmentFine,
  potAssignedPostings,
  redateNextCycleInstallments,
  roundLateFines,
  type Bid,
} from '../index';
import { TEST_GROUP } from '../ledger/ledger.test-support';
import { resolvePending } from './group-payouts.test-support';
import { NOT_YET, type GroupSimulator } from './group-simulator.test-support';

/** R6.1, R6.2: a late fine, assessed now and due at once. */
export function fine(sim: GroupSimulator, m: string): void {
  const tx = sim.append(
    'FINE_ASSESSED',
    fineAssessedPostings({ membershipId: m, amount: sim.params.lateFine }),
    { membershipId: m },
  );
  sim.obligations.push({
    id: sim.nextId('fine'),
    kind: 'FINE',
    membershipId: m,
    amount: sim.params.lateFine,
    dueAt: sim.now(),
    roundId: null,
    roundNumber: sim.slot,
    creditorMembershipId: null,
    status: 'DUE',
    inPendingPayment: false,
    cycle: sim.cycle,
    payoutAt: sim.now(),
    txSeq: tx.seq,
  });
}

function assessLateFines(sim: GroupSimulator): void {
  const roundId = sim.roundId();
  const members = sim.rotation.map((m) => ({
    membershipId: m,
    obligations: sim.obligations
      .filter(
        (o) =>
          o.membershipId === m &&
          o.roundId === roundId &&
          (o.kind === 'CONTRIBUTION' || o.kind === 'SOLIDARITY'),
      )
      .map((o) => ({
        kind: o.kind as 'CONTRIBUTION',
        status: o.status,
        onTimeIntentInProgress: false,
      })),
  }));
  for (const f of roundLateFines({ lateFine: sim.params.lateFine, members }))
    fine(sim, f.membershipId);
  const { dueAt, payoutAt } = sim.dates();
  for (const inst of sim.obligations.filter(
    (o) => o.kind === 'LOAN_INSTALLMENT' && o.status === 'DUE' && !o.fined,
  )) {
    if (inst.dueAt.getTime() > dueAt.getTime()) continue;
    inst.fined = true;
    const locked = sim.credits
      .filter(
        (c) => c.membershipId === inst.membershipId && c.payoutAt.getTime() === payoutAt.getTime(),
      )
      .reduce((s, c) => s + c.amount, 0);
    const decision = installmentFine({
      lateFine: sim.params.lateFine,
      installment: { ...inst, onTimeIntentInProgress: false },
      borrowerIsRoundBeneficiary: inst.membershipId === sim.beneficiary(),
      lockedPayout: Math.min(locked, sim.payable(inst.membershipId)),
      otherDueDebts: sim.dueDebts(inst.membershipId).filter((d) => d.id !== inst.id),
    });
    if (decision.fined) fine(sim, inst.membershipId);
  }
}

/** R8.3, R8.5, D10: closes the sealed bids; the pot goes to the winner, the bid becomes a debt. */
function closeBids(sim: GroupSimulator, seed: number): void {
  const roundId = sim.roundId();
  const eligible = sim.rotation.filter((m) => !sim.served.has(m));
  const { dueAt, payoutAt } = sim.dates();
  const bids: Bid[] = eligible
    .filter((_, i) => ((seed >> i) & 1) === 1)
    .map((m, i) => ({
      membershipId: m,
      amount: sim.params.minBid + ((seed + i) % 5) * 500,
      reachedAt: addHours(dueAt, -2 - i),
    }));
  const outcome = closeBidding({
    groupId: TEST_GROUP,
    cycleNumber: sim.cycle,
    roundNumber: sim.roundInCycle,
    roundId,
    latestLedgerHash: sim.chain.at(-1)?.hash ?? genesisHash(TEST_GROUP),
    eligibleMembershipIds: eligible,
    bids,
  });
  const winner = outcome.beneficiaryMembershipId;
  sim.beneficiaries.set(roundId, winner);
  // M3, R8.6: the result is recorded before any money moves.
  sim.append('EVENT', [], {
    metadata:
      outcome.outcome === 'DRAW'
        ? outcome.event
        : {
            event: 'BIDS_PUBLISHED',
            cycleNumber: sim.cycle,
            roundNumber: sim.roundInCycle,
            roundId,
            beneficiaryMembershipId: winner,
            bids: outcome.outcome === 'WINNING_BID' ? outcome.publishedBids : [],
          },
  });
  const pot = sim.summary().potByRound[roundId] ?? 0;
  if (pot > 0) {
    sim.append(
      'POT_ASSIGNED',
      potAssignedPostings({ roundId, beneficiaryMembershipId: winner, amount: pot }),
    );
    sim.credits.push({ membershipId: winner, amount: pot, payoutAt, paymentSeq: null });
    sim.counters.potAssigned += 1;
  }
  if (outcome.outcome === 'WINNING_BID' && outcome.amount > 0) {
    const tx = sim.append(
      'BID_ASSESSED',
      bidAssessedPostings({ membershipId: winner, amount: outcome.amount }),
      {
        membershipId: winner,
        roundId,
      },
    );
    sim.counters.bidAssessed += 1;
    sim.obligations.push({
      id: sim.nextId('bid'),
      kind: 'BID',
      membershipId: winner,
      amount: outcome.amount,
      dueAt: payoutAt, // R8.5: taken by auto-settlement at payout
      roundId,
      roundNumber: sim.slot,
      creditorMembershipId: null,
      status: 'DUE',
      inPendingPayment: false,
      cycle: sim.cycle,
      payoutAt,
      txSeq: tx.seq,
    });
  }
  sim.settle(winner);
}

/** R6 at dueAt (and the bidding close); R5.3 at payoutAt; then the next round, or the next cycle. */
/** D18.2: installments waiting for this new cycle take its round deadlines. */
function redateInstallments(sim: GroupSimulator): void {
  const rounds = sim.cycleRounds();
  for (const o of sim.obligations) {
    if (!o.nextCycle || o.status !== 'DUE') continue;
    const [due] = redateNextCycleInstallments([o.nextCycle], rounds);
    if (due!.status === 'DATED') {
      o.dueAt = due!.dueAt;
      o.payoutAt = due!.dueAt;
      delete o.nextCycle;
      sim.counters.installmentRedated += 1;
    } else {
      o.nextCycle = due!;
      o.dueAt = NOT_YET;
    }
  }
}

export function advance(sim: GroupSimulator, seed: number, onCycleEnd: () => void): void {
  resolvePending(sim, seed);
  if (sim.phase === 'OPEN') {
    sim.phase = 'DUE';
    if (sim.mode === 'BIDDING') closeBids(sim, seed);
    assessLateFines(sim);
  } else if (sim.phase === 'DUE') {
    sim.phase = 'PAID';
    const b = sim.beneficiary()!;
    sim.settle(b);
    sim.served.add(b);
  } else {
    if (sim.served.size >= sim.rotation.length) {
      onCycleEnd();
      sim.cycle += 1;
      sim.roundInCycle = 1;
      sim.served.clear();
    } else {
      sim.roundInCycle += 1;
    }
    sim.slot += 1;
    sim.phase = 'OPEN';
    sim.openRound();
    if (sim.roundInCycle === 1) redateInstallments(sim);
  }
}
