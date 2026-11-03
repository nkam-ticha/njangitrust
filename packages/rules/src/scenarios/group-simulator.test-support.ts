// A group simulator for property-based tests (spec 5.1): every action goes through the rules
// engine exactly as the services will, and every money movement is sealed into a ledger.

import {
  addHours,
  autoSettlement,
  autoSettlementPostings,
  availableForLoans,
  computeBalances,
  DEFAULT_RULE_SET,
  fineAssessedPostings,
  MOCK_FEE_SCHEDULE,
  paymentReceivedPostings,
  preparePayment,
  proposeRoundToPay,
  roundDates,
  roundLateFines,
  scheduleFee,
  sealTransaction,
  summarizeBalances,
  type BalanceSummary,
  type LedgerEntry,
  type LedgerTransaction,
  type OpenObligation,
  type Posting,
  type SettleableDebt,
  type TransactionType,
  roundObligations,
  installmentFine,
} from '../index';
import { TEST_GROUP } from '../ledger/ledger.test-support';

export type SimObligation = OpenObligation & {
  cycle: number;
  payoutAt: Date;
  fined?: boolean;
  txSeq?: number;
};

const DEBT_KINDS = ['FINE', 'BID', 'LOAN_INSTALLMENT'] as const;

export class GroupSimulator {
  readonly params = { ...DEFAULT_RULE_SET };
  readonly schedule = {
    firstPayoutAt: new Date('2026-11-28T17:00:00.000Z'),
    frequency: 'WEEKLY',
  } as const;
  chain: LedgerTransaction[] = [];
  rotation: string[];
  readonly everyone: string[];
  served = new Set<string>();
  cycle = 1;
  slot = 1;
  roundInCycle = 1;
  phase: 'OPEN' | 'DUE' | 'PAID' = 'OPEN';
  obligations: SimObligation[] = [];
  credits: { membershipId: string; amount: number; payoutAt: Date }[] = [];
  activeLoan = new Set<string>();
  private ids = 0;

  constructor(memberCount: number, seedFund: number) {
    this.rotation = Array.from({ length: memberCount }, (_, i) => `M${i + 1}`);
    this.everyone = [...this.rotation];
    if (seedFund > 0) {
      this.append(
        'FINE_ASSESSED',
        fineAssessedPostings({ membershipId: 'SEED', amount: seedFund }),
      );
      this.append('PAYMENT_RECEIVED', [
        { account: 'cash:provider', amount: seedFund },
        { account: 'receivable:member:SEED', amount: -seedFund },
      ]);
    }
    this.openRound();
  }

  nextId(prefix: string): string {
    this.ids += 1;
    return `${prefix}${this.ids}`;
  }

  dates(slot = this.slot) {
    return roundDates(this.schedule, slot);
  }

  now(): Date {
    const { dueAt, payoutAt } = this.dates();
    if (this.phase === 'OPEN') return addHours(dueAt, -1);
    return this.phase === 'DUE' ? addHours(dueAt, 1) : addHours(payoutAt, 1);
  }

  append(
    type: TransactionType,
    postings: Posting[],
    extra: Partial<LedgerEntry> = {},
  ): LedgerTransaction {
    const entry: LedgerEntry = {
      id: this.nextId('tx'),
      type,
      occurredAt: this.now().toISOString(),
      roundId: null,
      membershipId: null,
      refType: null,
      refId: null,
      descriptionFr: type,
      descriptionEn: type,
      metadata: {},
      postings,
      ...extra,
    };
    const tx = sealTransaction({ groupId: TEST_GROUP, previous: this.chain.at(-1) ?? null, entry });
    this.chain.push(tx);
    return tx;
  }

  summary(): BalanceSummary {
    return summarizeBalances(computeBalances(this.chain));
  }

  payable(m: string): number {
    return this.summary().payableByMember[m] ?? 0;
  }

  available(): number {
    return availableForLoans({ summary: this.summary(), inFlightDisbursements: 0 });
  }

  owed(m: string): SimObligation[] {
    return this.obligations.filter((o) => o.membershipId === m && o.status === 'DUE');
  }

  dueDebts(m: string): SettleableDebt[] {
    const now = this.now().getTime();
    return this.owed(m)
      .filter((o) => (DEBT_KINDS as readonly string[]).includes(o.kind) && o.dueAt.getTime() <= now)
      .map((o) => ({
        id: o.id,
        kind: o.kind as SettleableDebt['kind'],
        amount: o.amount,
        dueAt: o.dueAt,
      }));
  }

  beneficiary(): string {
    return this.rotation[this.roundInCycle - 1]!;
  }

  openRound(): void {
    const { dueAt, payoutAt } = this.dates();
    const roundId = `c${this.cycle}r${this.roundInCycle}`;
    const drafts = roundObligations({
      contributionAmount: this.params.contributionAmount,
      solidarityContribution: this.params.solidarityContribution,
      round: { id: roundId, dueAt, beneficiaryMembershipId: this.beneficiary() },
      activeMembershipIds: this.rotation,
    });
    for (const d of drafts) {
      this.obligations.push({
        ...d,
        id: this.nextId('ob'),
        roundNumber: this.slot,
        status: 'DUE',
        inPendingPayment: false,
        cycle: this.cycle,
        payoutAt,
      });
    }
  }

  /** R5.3: takes due debts from the member's payable. */
  settle(m: string): void {
    const { settled, total } = autoSettlement({
      payableBalance: this.payable(m),
      debts: this.dueDebts(m),
      now: this.now(),
    });
    if (total === 0) return;
    this.append('AUTO_SETTLEMENT', autoSettlementPostings({ membershipId: m, amount: total }));
    for (const d of settled) this.obligations.find((o) => o.id === d.id)!.status = 'SETTLED';
    this.closeRepaidLoan(m);
  }

  closeRepaidLoan(m: string): void {
    if (
      !this.obligations.some(
        (o) => o.membershipId === m && o.kind === 'LOAN_INSTALLMENT' && o.status === 'DUE',
      )
    ) {
      this.activeLoan.delete(m);
    }
  }

  /** R3.3, R3.6, R4.2, R5.1: the member pays the oldest round owed (and due debts), or due debts only. */
  pay(m: string, includeDebts: boolean): boolean {
    const owed = this.owed(m);
    const proposal = proposeRoundToPay(owed, { now: this.now(), includeDueDebts: includeDebts });
    const now = this.now().getTime();
    const ids =
      proposal?.obligationIds ??
      owed
        .filter(
          (o) => o.kind !== 'CONTRIBUTION' && o.kind !== 'SOLIDARITY' && o.dueAt.getTime() <= now,
        )
        .map((o) => o.id);
    const chosen = owed.filter((o) => ids.includes(o.id));
    const prepared = preparePayment({ payerMembershipId: m, obligations: chosen });
    if (!prepared.ok) return false;
    const fee = Math.min(
      scheduleFee(MOCK_FEE_SCHEDULE, 'COLLECTION', prepared.total),
      prepared.total,
    );
    const { postings, parts } = paymentReceivedPostings({
      payerMembershipId: m,
      fee,
      parts: prepared.parts,
    });
    this.append('PAYMENT_RECEIVED', postings, { membershipId: m });
    const credited = new Set<string>();
    for (const part of parts) {
      const ob = chosen.find((o) => o.id === part.ref)!;
      ob.status = 'PAID';
      if (part.kind === 'CONTRIBUTION') {
        this.credits.push({
          membershipId: part.creditorMembershipId!,
          amount: part.amount - part.feeShare,
          payoutAt: ob.payoutAt,
        });
      }
      if (part.creditorMembershipId) credited.add(part.creditorMembershipId);
    }
    for (const c of credited) this.settle(c);
    this.closeRepaidLoan(m);
    return true;
  }

  /** R6.1, R6.2 at dueAt; R5.3 at payoutAt; then the next round, or the next cycle. */
  advance(onCycleEnd: () => void): void {
    if (this.phase === 'OPEN') {
      this.phase = 'DUE';
      const roundId = `c${this.cycle}r${this.roundInCycle}`;
      const members = this.rotation.map((m) => ({
        membershipId: m,
        obligations: this.obligations
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
      for (const f of roundLateFines({ lateFine: this.params.lateFine, members }))
        this.fine(f.membershipId);
      for (const inst of this.obligations.filter(
        (o) => o.kind === 'LOAN_INSTALLMENT' && o.status === 'DUE' && !o.fined,
      )) {
        if (inst.dueAt.getTime() > this.dates().dueAt.getTime()) continue;
        inst.fined = true;
        const locked = this.credits
          .filter(
            (c) =>
              c.membershipId === inst.membershipId &&
              c.payoutAt.getTime() === this.dates().payoutAt.getTime(),
          )
          .reduce((s, c) => s + c.amount, 0);
        const decision = installmentFine({
          lateFine: this.params.lateFine,
          installment: { ...inst, onTimeIntentInProgress: false },
          borrowerIsRoundBeneficiary: inst.membershipId === this.beneficiary(),
          lockedPayout: Math.min(locked, this.payable(inst.membershipId)),
          otherDueDebts: this.dueDebts(inst.membershipId).filter((d) => d.id !== inst.id),
        });
        if (decision.fined) this.fine(inst.membershipId);
      }
    } else if (this.phase === 'DUE') {
      this.phase = 'PAID';
      this.settle(this.beneficiary());
      this.served.add(this.beneficiary());
    } else {
      if (this.roundInCycle >= this.rotation.length) {
        onCycleEnd();
        this.cycle += 1;
        this.roundInCycle = 1;
        this.served.clear();
      } else {
        this.roundInCycle += 1;
      }
      this.slot += 1;
      this.phase = 'OPEN';
      this.openRound();
    }
  }

  fine(m: string): void {
    const tx = this.append(
      'FINE_ASSESSED',
      fineAssessedPostings({ membershipId: m, amount: this.params.lateFine }),
      { membershipId: m },
    );
    this.obligations.push({
      id: this.nextId('fine'),
      kind: 'FINE',
      membershipId: m,
      amount: this.params.lateFine,
      dueAt: this.now(),
      roundId: null,
      roundNumber: this.slot,
      creditorMembershipId: null,
      status: 'DUE',
      inPendingPayment: false,
      cycle: this.cycle,
      payoutAt: this.now(),
      txSeq: tx.seq,
    });
  }
}
