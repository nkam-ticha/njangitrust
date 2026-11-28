// What governance needs from the money modules (ledger, cycles, rounds, obligations, loans, funds,
// payouts). The money engineer implements these and registers them at start-up
// (`registerGovernancePorts` in src/modules/register.ts). Governance never computes or moves money
// itself: it decides, then calls these inside the same database transaction.
import type { FeeSchedule, GovernanceEvent, RuleSetParams } from '@njangi/rules';
import type { Bilingual } from '@njangi/shared';
import type { EffectSink } from '../../lib/after-commit';
import type { Db, Prisma } from '../../lib/prisma';
import { componentLogger } from '../../lib/logger';

type Tx = Prisma.TransactionClient;

/** R11.8, R12, 2.5: an EVENT entry (no postings) in the group's hash chain. */
export interface LedgerEventInput {
  groupId: string;
  event: GovernanceEvent;
  description: Bilingual;
  membershipId?: string | null;
  refType: 'Proposal' | 'Membership' | 'Meeting';
  refId: string;
  occurredAt: Date;
}

export interface LedgerEventsPort {
  appendEvent(tx: Tx, input: LedgerEventInput): Promise<void>;
}

export interface FineDescription {
  membershipId: string;
  amount: number;
  roundNumber: number | null;
  /** Only a fine still DUE and not in an open payment can be waived (a paid one cannot). */
  waivable: boolean;
}

export interface MoneyGovernancePort {
  /** The group's current cycle rotation and round in progress (0 before round 1), or null. */
  currentRotation(
    db: Db,
    groupId: string,
  ): Promise<{
    cycleId: string;
    cycleNumber: number;
    rotation: string[];
    currentRound: number;
  } | null>;
  /**
   * D13.1: applies a new rule set version from the next round (re-dating rounds after a frequency
   * or payout-time change; FIXED <-> BIDDING switches). Returns the first round it applies to.
   */
  applyRuleSet(
    tx: Tx,
    input: {
      groupId: string;
      version: number;
      previous: RuleSetParams;
      next: RuleSetParams;
      proposalId: string;
    },
  ): Promise<{ effectiveFromRoundId: string | null; effectiveFromRoundNumber: number | null }>;
  /**
   * R1.1, R2.1, R2.3, GRP-02/03: starts a cycle (rounds, draw or kept order and its EVENT,
   * obligations). The first cycle (group FORMING) needs nothing more; a later one (D40.2, between
   * cycles) takes the admin's chosen `firstPayoutAt` and also needs `effects` for its chat line
   * and notifications (an EffectSink; omitted only by callers that run outside a request).
   */
  startCycle(
    tx: Tx,
    input: { groupId: string; startedByUserId: string; firstPayoutAt?: Date },
    effects?: EffectSink,
  ): Promise<{ cycleNumber: number; firstBeneficiaryMembershipId: string | null }>;
  /** R2.4: the new order applies from the next round. */
  applyRotationChange(
    tx: Tx,
    input: { groupId: string; newOrder: string[]; proposalId: string },
  ): Promise<void>;
  /** R12.3 and D13.4: settlement when a member leaves mid-cycle or is removed. */
  settleExit(
    tx: Tx,
    input: {
      groupId: string;
      membershipId: string;
      reason: 'EARLY_EXIT' | 'REMOVED';
      proposalId: string;
    },
  ): Promise<void>;
  /** FINE_WAIVER: the fine (a FINE obligation of this group), or null if there is none. */
  describeFine(
    db: Db,
    input: { groupId: string; obligationId: string },
  ): Promise<FineDescription | null>;
  /** R6.4: cancels the fine (REVERSAL of its FINE_ASSESSED, or refund if already settled). */
  waiveFine(
    tx: Tx,
    input: { groupId: string; obligationId: string; proposalId: string },
  ): Promise<void>;
  /** LEDGER_CORRECTION: whether the entry exists and can be corrected (not an EVENT, not reversed). */
  describeLedgerEntry(
    db: Db,
    input: { groupId: string; seq: number },
  ): Promise<{ correctable: boolean } | null>;
  /** LEDGER_CORRECTION: REVERSAL of the entry plus the corrected entry described by the vote. */
  correctLedger(
    tx: Tx,
    input: { groupId: string; seq: number; correction: string; proposalId: string },
  ): Promise<void>;
  /** R4.4: the fee schedule used to estimate disbursement fees. */
  feeSchedule(): FeeSchedule;
  /** R10: the solidarity fund balance and passed payouts not yet paid. */
  solidarityFund(db: Db, groupId: string): Promise<{ balance: number; pendingPayouts: number }>;
  /** R10.3, D13.5: pays a passed request (now, or when the recipient's hold ends). */
  paySolidarity(
    tx: Tx,
    input: { groupId: string; solidarityRequestId: string; proposalId: string },
    /** Work that must wait for the commit (asking the operator to send). */
    effects?: EffectSink,
  ): Promise<void>;
  /**
   * R7.4: the ADMIN_LOAN vote's result for the loan. Work that must wait for the commit (asking
   * for the disbursement) goes to `effects`.
   */
  decideAdminLoan(
    tx: Tx,
    input: { groupId: string; loanId: string; approved: boolean; proposalId: string; now: Date },
    effects: EffectSink,
  ): Promise<void>;
}

const log = componentLogger('governance');

/** Until the ledger service exists, events are logged, not recorded (reported to the lead). */
const loggingLedgerEvents: LedgerEventsPort = {
  appendEvent(_tx, input) {
    log.warn(
      { groupId: input.groupId, event: input.event.event },
      'ledger EVENT not recorded: no ledger port registered',
    );
    return Promise.resolve();
  },
};

let ledgerEvents: LedgerEventsPort = loggingLedgerEvents;
let money: Partial<MoneyGovernancePort> = {};

const MONEY_OPERATIONS = [
  'currentRotation',
  'applyRuleSet',
  'startCycle',
  'applyRotationChange',
  'settleExit',
  'describeFine',
  'waiveFine',
  'describeLedgerEntry',
  'correctLedger',
  'feeSchedule',
  'solidarityFund',
  'paySolidarity',
  'decideAdminLoan',
] as const satisfies readonly (keyof MoneyGovernancePort)[];

/**
 * The money modules register the operations they have built; a later registration replaces the
 * same operation. Governance that needs the whole port (`moneyPort()`) stays unavailable until
 * every operation is there.
 */
export function registerGovernancePorts(ports: {
  ledgerEvents?: LedgerEventsPort;
  money?: Partial<MoneyGovernancePort>;
}): void {
  if (ports.ledgerEvents) ledgerEvents = ports.ledgerEvents;
  if (ports.money) money = { ...money, ...ports.money };
}

const recorders = new Set<LedgerEventInput[]>();

/** Every EVENT governance sends goes through here, so tests can scan them (privacy-guard L-5). */
const recordingLedgerEvents: LedgerEventsPort = {
  appendEvent(tx, input) {
    for (const recorder of recorders) recorder.push(input);
    return ledgerEvents.appendEvent(tx, input);
  },
};

export function ledgerEventsPort(): LedgerEventsPort {
  return recorders.size > 0 ? recordingLedgerEvents : ledgerEvents;
}

/** Tests only: records every ledger EVENT input from now on (until `stopRecordingLedgerEvents`). */
export function recordLedgerEvents(): LedgerEventInput[] {
  if (process.env.NODE_ENV !== 'test') throw new Error('test only');
  const recorded: LedgerEventInput[] = [];
  recorders.add(recorded);
  return recorded;
}

export function stopRecordingLedgerEvents(recorded: LedgerEventInput[]): void {
  recorders.delete(recorded);
}

/** The whole money port, or null while any of its operations is not registered. */
export function moneyPort(): MoneyGovernancePort | null {
  return MONEY_OPERATIONS.every((name) => money[name] !== undefined)
    ? (money as MoneyGovernancePort)
    : null;
}

/** One money operation, or null while the money modules have not registered it. */
export function moneyOperation<K extends keyof MoneyGovernancePort>(
  name: K,
): MoneyGovernancePort[K] | null {
  return money[name] ?? null;
}

/** Tests only: back to the defaults. */
export function resetGovernancePortsForTests(): void {
  ledgerEvents = loggingLedgerEvents;
  money = {};
}
