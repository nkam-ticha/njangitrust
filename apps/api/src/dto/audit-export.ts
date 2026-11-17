// Audit export mappers (spec 2.11, 2.14): an allowlist of fields for the file any member downloads.
// A payment number leaves only masked; a secret proposal never lists ballots (R11.5).
import { maskNumber } from '@njangi/shared';
import { completeRuleSet } from '@njangi/rules';
import type { ExportCycle, ExportMember, ExportProposal, ExportRuleSet } from '@njangi/rules';
import { iso, isoOrNull } from './time';

export interface ExportMemberSource {
  id: string;
  role: ExportMember['role'];
  status: ExportMember['status'];
  user: { name: string; paymentNumbers: { number: string }[] };
}

export function toExportMember(m: ExportMemberSource): ExportMember {
  const number = m.user.paymentNumbers[0]?.number;
  return {
    membershipId: m.id,
    name: m.user.name,
    role: m.role,
    status: m.status,
    paymentNumberMasked: number ? maskNumber(number) : null,
  };
}

export interface ExportRuleSetSource {
  version: number;
  params: unknown;
  effectiveFromRoundId: string | null;
  createdByProposalId: string | null;
}

export function toExportRuleSet(r: ExportRuleSetSource): ExportRuleSet {
  return {
    version: r.version,
    params: completeRuleSet(r.params),
    effectiveFromRoundId: r.effectiveFromRoundId,
    createdByProposalId: r.createdByProposalId,
  };
}

export interface ExportCycleSource {
  number: number;
  mode: ExportCycle['mode'];
  drawSeed: string | null;
  rotation: string[];
  startedAt: Date;
  closedAt: Date | null;
}

export function toExportCycle(c: ExportCycleSource): ExportCycle {
  return {
    number: c.number,
    mode: c.mode,
    drawSeed: c.drawSeed,
    rotation: [...c.rotation],
    startedAt: iso(c.startedAt),
    closedAt: isoOrNull(c.closedAt),
  };
}

export interface ExportProposalSource {
  id: string;
  type: ExportProposal['type'];
  secret: boolean;
  thresholdKind: ExportProposal['thresholdKind'];
  eligibleMembershipIds: string[];
  yesCount: number;
  noCount: number;
  status: ExportProposal['status'];
  opensAt: Date;
  closesAt: Date;
  appliedAt: Date | null;
}

/**
 * `openBallots` are the ballots of a show-of-hands vote. For a secret proposal they are ignored
 * whatever is passed: only its counters leave.
 */
export function toExportProposal(
  p: ExportProposalSource,
  openBallots: readonly { membershipId: string; choice: 'YES' | 'NO' }[],
): ExportProposal {
  return {
    id: p.id,
    type: p.type,
    secret: p.secret,
    thresholdKind: p.thresholdKind,
    eligibleCount: p.eligibleMembershipIds.length,
    yesCount: p.yesCount,
    noCount: p.noCount,
    status: p.status,
    opensAt: iso(p.opensAt),
    closesAt: iso(p.closesAt),
    appliedAt: isoOrNull(p.appliedAt),
    ballots: p.secret
      ? null
      : openBallots.map((b) => ({ membershipId: b.membershipId, choice: b.choice })),
  };
}
