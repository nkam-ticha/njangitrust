// Checks of an audit export beyond the hash chain (2.14): draws (R2.3, R8.3), proposal tallies
// (R11.2, R11.5) and masked phone numbers (2.11).

import { thresholdCount } from '../votes';
import { drawEventProblem, type BiddingDrawEvent, type CycleStartedEvent } from './events';
import type { ExportCycle, ExportProposal } from './export-format';
import { genesisHash } from './hash-chain';
import type { LedgerTransaction } from './types';
import type { LedgerProblem } from './validation';

const isStringList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

function asDrawEvent(metadata: unknown): CycleStartedEvent | BiddingDrawEvent | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  if (m.event === 'CYCLE_STARTED' && isStringList(m.order))
    return m as unknown as CycleStartedEvent;
  if (m.event === 'BIDDING_DRAW' && isStringList(m.eligibleMembershipIds))
    return m as unknown as BiddingDrawEvent;
  return null;
}

/** R2.3, R8.3: re-runs every recorded draw and matches each cycle's seed with its CYCLE_STARTED event. */
export function drawProblems(
  groupId: string,
  transactions: readonly LedgerTransaction[],
  cycles: readonly ExportCycle[],
): LedgerProblem[] {
  const problems: LedgerProblem[] = [];
  const started = new Map<number, { seq: number; event: CycleStartedEvent }>();
  transactions.forEach((tx, i) => {
    if (tx.type !== 'EVENT') return;
    const event = asDrawEvent(tx.metadata);
    if (!event) return;
    const latest = i === 0 ? genesisHash(groupId) : transactions[i - 1]!.hash;
    let issue: string | null;
    try {
      issue = drawEventProblem(groupId, event, latest);
    } catch {
      issue = 'the draw event is malformed';
    }
    if (issue) problems.push({ seq: tx.seq, code: 'DRAW_MISMATCH', detail: issue });
    if (event.event === 'CYCLE_STARTED') started.set(event.cycleNumber, { seq: tx.seq, event });
  });
  for (const cycle of cycles) {
    const found = started.get(cycle.number);
    if (!found) {
      problems.push({
        seq: null,
        code: 'DRAW_MISMATCH',
        detail: `no CYCLE_STARTED event for cycle ${cycle.number}`,
      });
    } else if (found.event.drawSeed !== cycle.drawSeed || found.event.mode !== cycle.mode) {
      problems.push({
        seq: found.seq,
        code: 'DRAW_MISMATCH',
        detail: `cycle ${cycle.number} differs from its draw event`,
      });
    }
  }
  return problems;
}

function proposalIssue(p: ExportProposal): string | null {
  const counts = [p.eligibleCount, p.yesCount, p.noCount];
  if (counts.some((c) => !Number.isSafeInteger(c) || c < 0)) return 'counts must be whole numbers';
  if (p.yesCount + p.noCount > p.eligibleCount) return 'more votes than eligible voters';
  const required = thresholdCount(p.thresholdKind, p.eligibleCount);
  const remaining = p.eligibleCount - p.yesCount - p.noCount;
  if (p.status === 'PASSED' && p.yesCount < required) return 'passed below its threshold';
  if (p.status === 'EXPIRED' && p.yesCount >= required)
    return 'expired although the threshold was reached';
  if (p.type !== 'ROTATION_CHANGE') {
    if (p.status === 'REJECTED' && p.yesCount + remaining >= required)
      return 'rejected while still reachable';
    if (p.status === 'OPEN' && p.yesCount >= required)
      return 'still open although the threshold was reached';
  }
  if (p.secret) return p.ballots && p.ballots.length > 0 ? 'a secret vote lists ballots' : null;
  if (p.ballots) {
    const voters = new Set(p.ballots.map((b) => b.membershipId));
    if (voters.size !== p.ballots.length) return 'a member voted twice';
    const yes = p.ballots.filter((b) => b.choice === 'YES').length;
    if (yes !== p.yesCount || p.ballots.length - yes !== p.noCount)
      return 'ballots do not match the totals';
  }
  return null;
}

/** R11.2, R11.5: totals consistent with thresholds and status; secret votes never list ballots. */
export function proposalProblems(proposals: readonly ExportProposal[]): LedgerProblem[] {
  const problems: LedgerProblem[] = [];
  for (const p of proposals) {
    let issue: string | null;
    try {
      issue = proposalIssue(p);
    } catch {
      issue = 'the proposal is malformed';
    }
    if (issue)
      problems.push({
        seq: null,
        code: 'PROPOSAL_INCONSISTENT',
        detail: `proposal ${String(p?.id)}: ${issue}`,
      });
  }
  return problems;
}

/** Spec 4.8: the phone-number pattern of the output guard. */
const PHONE = /(?:\+?237[\s.-]?)?6(?:[\s.-]?\d){8}/;
/** IDs and hashes (hex and dashes) are not free text and are skipped. */
const HEX_ID = /^[0-9a-f-]+$/i;

/** 2.11, 2.14: every place in the export where a phone number appears unmasked (paths only, no digits). */
export function unmaskedPhoneProblems(data: unknown): LedgerProblem[] {
  const problems: LedgerProblem[] = [];
  const walk = (value: unknown, path: string, seq: number | null): void => {
    if (typeof value === 'string') {
      if (!HEX_ID.test(value) && PHONE.test(value)) {
        problems.push({
          seq,
          code: 'UNMASKED_PHONE_NUMBER',
          detail: `unmasked phone number at ${path}`,
        });
      }
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => {
        const itemSeq = path === 'transactions' ? ((item as LedgerTransaction)?.seq ?? null) : seq;
        walk(item, `${path}[${i}]`, typeof itemSeq === 'number' ? itemSeq : null);
      });
    } else if (value && typeof value === 'object') {
      for (const [key, v] of Object.entries(value)) walk(v, path ? `${path}.${key}` : key, seq);
    }
  };
  walk(data, '', null);
  return problems;
}
