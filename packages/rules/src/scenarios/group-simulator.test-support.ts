// A group simulator for property-based tests (spec 5.1): every decision goes through the rules
// engine as the services will make it, and every money movement is sealed into a ledger.

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
  reservedShortfall,
  resolvePaymentParts,
  roundDates,
  roundObligations,
  scheduleFee,
  sealTransaction,
  summarizeBalances,
  type BalanceSummary,
  type DisbursementPurpose,
  type InstallmentDue,
  type LedgerEntry,
  type LedgerTransaction,
  type OpenObligation,
  type PaymentPartWithFee,
  type Posting,
  type RotationMode,
  type SettleableDebt,
  type TransactionType,
} from '../index';
import { TEST_GROUP } from '../ledger/ledger.test-support';

export type SimObligation = OpenObligation & {
  cycle: number;
  payoutAt: Date;
  fined?: boolean;
  txSeq?: number;
  /** D18.2: an installment "due at a round of the next cycle" (dueAt is then NOT_YET). */
  nextCycle?: InstallmentDue;
  /** The loan disbursement an installment belongs to. */
  loanOp?: string;
};

/** D22.1: a completed disbursement, kept so the operator can reverse it later. */
export type SimCompleted = SimPending & { completed: LedgerTransaction; refunded: boolean };

/** D18.2: dueAt of an installment waiting for the next cycle (never reached in a simulation). */
export const NOT_YET = new Date('2100-01-01T00:00:00.000Z');

/** D18.1: a disbursement sent to the provider and not yet answered. */
export type SimPending = {
  sent: LedgerTransaction;
  purpose: DisbursementPurpose;
  member: string;
  operationId: string;
  amount: number;
  feeEstimated: number;
};

/** A posted payment, kept so it can be reversed later. */
export type SimPayment = {
  tx: LedgerTransaction;
  payer: string;
  parts: PaymentPartWithFee[];
  reversed: boolean;
};

type Lines = Posting[] | { postings: Posting[]; metadata: object };
const DEBT_KINDS: readonly string[] = ['FINE', 'BID', 'CORRECTION', 'LOAN_INSTALLMENT'];

export class GroupSimulator {
  readonly params = { ...DEFAULT_RULE_SET };
  readonly schedule = {
    firstPayoutAt: new Date('2026-11-28T17:00:00.000Z'),
    frequency: 'WEEKLY',
  } as const;
  chain: LedgerTransaction[] = [];
  rotation: string[];
  readonly everyone: string[];
  readonly beneficiaries = new Map<string, string>(); // roundId → beneficiary
  served = new Set<string>();
  cycle = 1;
  slot = 1;
  roundInCycle = 1;
  phase: 'OPEN' | 'DUE' | 'PAID' = 'OPEN';
  obligations: SimObligation[] = [];
  credits: { membershipId: string; amount: number; payoutAt: Date; paymentSeq: number | null }[] =
    [];
  payments: SimPayment[] = [];
  activeLoan = new Set<string>();
  pending: SimPending[] = [];
  completed: SimCompleted[] = [];
  /** How often the rarer paths ran, so the property test can prove it exercised them. */
  readonly counters = {
    potAssigned: 0,
    potCorrection: 0,
    correctionDebt: 0,
    clawback: 0,
    coverageBroken: 0,
    feeAboveEstimate: 0,
    reversal: 0,
    /** D18.1: sends left in flight, completed later, and failures returned. */
    keptInFlight: 0,
    completedLater: 0,
    returned: 0,
    /** L6: a correction block planned while money was in flight. */
    correctionWithInFlight: 0,
    /** D18.3: solidarity clawbacks, rolled back over several payouts, and owed by the payer. */
    solidarityClawback: 0,
    solidarityRollback: 0,
    payerOwes: 0,
    /** D18.2: installments placed in the next cycle, then re-dated. */
    installmentNextCycle: 0,
    installmentRedated: 0,
    /** M3: winning bids assessed against the published result. */
    bidAssessed: 0,
    /** D22.1: completed disbursements refunded by the operator, with a fee kept. */
    refunded: 0,
    refundFeeKept: 0,
    /** D22.2: correction debts repaid by request, the member bearing the fee. */
    correctionFeeBorne: 0,
  };
  private ids = 0;

  constructor(
    memberCount: number,
    seedFund: number,
    readonly mode: RotationMode = 'FIXED',
  ) {
    this.rotation = Array.from({ length: memberCount }, (_, i) => `M${i + 1}`);
    this.everyone = [...this.rotation];
    if (seedFund > 0) {
      this.append(
        'FINE_ASSESSED',
        fineAssessedPostings({ membershipId: 'SEED', amount: seedFund }),
      );
      this.append(
        'PAYMENT_RECEIVED',
        paymentReceivedPostings({
          payerMembershipId: 'SEED',
          fee: 0,
          feeSource: 'PROVIDER',
          parts: [{ kind: 'DEBT', amount: seedFund, ref: 'seed' }],
        }),
        { membershipId: 'SEED' },
      );
    }
    this.openRound();
  }

  nextId(prefix: string): string {
    this.ids += 1;
    return `${prefix}${this.ids}`;
  }

  roundId(): string {
    return `c${this.cycle}r${this.roundInCycle}`;
  }

  dates(slot = this.slot) {
    return roundDates(this.schedule, slot);
  }

  now(): Date {
    const { dueAt, payoutAt } = this.dates();
    if (this.phase === 'OPEN') return addHours(dueAt, -1);
    return this.phase === 'DUE' ? addHours(dueAt, 1) : addHours(payoutAt, 1);
  }

  append(type: TransactionType, lines: Lines, extra: Partial<LedgerEntry> = {}): LedgerTransaction {
    const { postings, metadata } = Array.isArray(lines) ? { postings: lines, metadata: {} } : lines;
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
      metadata: metadata as LedgerEntry['metadata'],
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

  /** D16.2: the daily check pauses every disbursement while reserved money is not covered. */
  reconciliationStatus(): 'OK' | 'ALERT' {
    return reservedShortfall(this.summary()) > 0 ? 'ALERT' : 'OK';
  }

  available(): number {
    return availableForLoans({ summary: this.summary() });
  }

  owed(m: string): SimObligation[] {
    const owed = this.obligations.filter((o) => o.membershipId === m && o.status === 'DUE');
    // L2: installments of a loan still in flight can't be paid or settled yet.
    for (const o of owed)
      if (o.loanOp) o.loanInFlight = this.pending.some((p) => p.operationId === o.loanOp);
    return owed;
  }

  dueDebts(m: string): SettleableDebt[] {
    const now = this.now().getTime();
    return this.owed(m)
      .filter((o) => DEBT_KINDS.includes(o.kind) && o.dueAt.getTime() <= now)
      .map((o) => ({
        id: o.id,
        kind: o.kind as SettleableDebt['kind'],
        amount: o.amount,
        dueAt: o.dueAt,
        ...(o.loanInFlight ? { loanInFlight: true } : {}),
      }));
  }

  /** R5.4, D18.1: one withdrawal at a time per member. */
  withdrawalInProgress(m: string): boolean {
    return this.pending.some((p) => p.purpose === 'WITHDRAWAL' && p.member === m);
  }

  /** The rounds left in the current cycle, the round in progress included (D18.2). */
  cycleRounds(): { dueAt: Date; payoutAt: Date }[] {
    return Array.from({ length: this.rotation.length - this.roundInCycle + 1 }, (_, k) =>
      this.dates(this.slot + k),
    );
  }

  beneficiary(): string | null {
    return this.beneficiaries.get(this.roundId()) ?? null;
  }

  openRound(): void {
    const { dueAt, payoutAt } = this.dates();
    if (this.mode === 'FIXED')
      this.beneficiaries.set(this.roundId(), this.rotation[this.roundInCycle - 1]!);
    const drafts = roundObligations({
      contributionAmount: this.params.contributionAmount,
      solidarityContribution: this.params.solidarityContribution,
      round: { id: this.roundId(), dueAt, beneficiaryMembershipId: this.beneficiary() },
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

  /** R5.3, D13.3: takes due debts from the member's payable, strictly oldest first. */
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
    const open = this.obligations.some(
      (o) => o.membershipId === m && o.kind === 'LOAN_INSTALLMENT' && o.status === 'DUE',
    );
    if (open) this.activeLoan.add(m);
    else this.activeLoan.delete(m);
  }

  /** R3.3, R3.6, R3.4, R4.2: pays the oldest round owed (and due debts), parts resolved at posting. */
  pay(m: string, includeDebts: boolean): boolean {
    const owed = this.owed(m);
    const now = this.now().getTime();
    const proposal = proposeRoundToPay(owed, { now: this.now(), includeDueDebts: includeDebts });
    const ids =
      proposal?.obligationIds ??
      owed
        .filter(
          (o) =>
            o.kind !== 'CONTRIBUTION' &&
            o.kind !== 'SOLIDARITY' &&
            o.dueAt.getTime() <= now &&
            !o.loanInFlight,
        )
        .map((o) => o.id);
    const chosen = owed.filter((o) => ids.includes(o.id));
    const prepared = preparePayment({
      payerMembershipId: m,
      obligations: chosen,
      feeSchedule: MOCK_FEE_SCHEDULE,
    });
    if (!prepared.ok) return false;
    if (prepared.parts.some((p) => p.feeCharged)) this.counters.correctionFeeBorne += 1;
    const parts = resolvePaymentParts(prepared.parts, {
      beneficiaryOfRound: (roundId) => this.beneficiaries.get(roundId) ?? null,
      rotationPosition: (id) => this.everyone.indexOf(id) + 1,
    });
    const fee = Math.min(
      scheduleFee(MOCK_FEE_SCHEDULE, 'COLLECTION', prepared.total),
      prepared.total - 1,
    );
    const lines = paymentReceivedPostings({
      payerMembershipId: m,
      fee,
      feeSource: 'SCHEDULE',
      parts,
    });
    const tx = this.append('PAYMENT_RECEIVED', lines, { membershipId: m });
    this.payments.push({ tx, payer: m, parts: lines.parts, reversed: false });
    const credited = new Set<string>();
    for (const part of lines.parts) {
      const ob = chosen.find((o) => o.id === part.ref)!;
      ob.status = 'PAID';
      if (part.kind === 'CONTRIBUTION' && part.creditorMembershipId) {
        const net = part.amount - part.feeShare;
        this.credits.push({
          membershipId: part.creditorMembershipId,
          amount: net,
          payoutAt: ob.payoutAt,
          paymentSeq: tx.seq,
        });
      }
      if (part.creditorMembershipId) credited.add(part.creditorMembershipId);
    }
    for (const c of credited) this.settle(c);
    this.closeRepaidLoan(m);
    return true;
  }
}
