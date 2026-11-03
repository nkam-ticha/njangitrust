// The audit export (spec 2.14): what any member downloads and tools/verify-ledger checks.
// Phone numbers appear only masked; secret ballots are never linked to voters.

import type { MembershipStatus } from '../membership';
import type { RotationMode, RuleSetParams } from '../ruleset';
import type { ProposalStatus, ProposalType, ThresholdKind } from '../votes';
import type { LedgerTransaction } from './types';

export const LEDGER_EXPORT_FORMAT = 'njangitrust.ledger-export';
export const LEDGER_EXPORT_VERSION = 1;

export interface ExportMember {
  membershipId: string;
  name: string;
  role: 'ADMIN' | 'MEMBER';
  status: MembershipStatus;
  /** Masked like `6•• •• •7 89` (spec 1.5); never the full number. */
  paymentNumberMasked: string | null;
}

export interface ExportRuleSet {
  version: number;
  params: RuleSetParams;
  effectiveFromRoundId: string | null;
  createdByProposalId: string | null;
}

export interface ExportCycle {
  number: number;
  mode: RotationMode;
  /** R2.3: the seed recorded in the CYCLE_STARTED event (null in bidding mode). */
  drawSeed: string | null;
  /** The current rotation (after any ROTATION_CHANGE). */
  rotation: string[];
  startedAt: string;
  closedAt: string | null;
}

export interface ExportProposal {
  id: string;
  type: ProposalType;
  secret: boolean;
  thresholdKind: ThresholdKind;
  eligibleCount: number;
  yesCount: number;
  noCount: number;
  status: ProposalStatus;
  opensAt: string;
  closesAt: string;
  appliedAt: string | null;
  /** Only for non-secret proposals (R11.5). */
  ballots: { membershipId: string; choice: 'YES' | 'NO' }[] | null;
}

/** Spec 2.14: the JSON ledger export of one group. Times are ISO 8601 UTC strings. */
export interface LedgerExport {
  format: typeof LEDGER_EXPORT_FORMAT;
  version: typeof LEDGER_EXPORT_VERSION;
  exportedAt: string;
  group: { id: string; name: string };
  members: ExportMember[];
  ruleSets: ExportRuleSet[];
  cycles: ExportCycle[];
  proposals: ExportProposal[];
  transactions: LedgerTransaction[];
  /** The last transaction at export time, so a truncated export is detected. */
  head: { seq: number; hash: string } | null;
  /** Raw balances per account (debit positive) as computed by the server at export time. */
  balances: Record<string, number>;
}
