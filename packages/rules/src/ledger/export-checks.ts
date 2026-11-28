// Checks of an audit export beyond the hash chain (2.14): draws (R2.3, R8.3), bidding results against
// eligibility (R8.2–R8.4, M2), proposal tallies
// (R11.2, R11.5) and masked phone numbers (2.11).

import { thresholdCount } from '../votes';
import { parseAccount } from './accounts';
import {
  drawEventProblem,
  type CycleStartedEvent,
  type DrawEvent,
  type RotationRedrawnEvent,
} from './events';
import type { ExportCycle, ExportProposal } from './export-format';
import { genesisHash } from './hash-chain';
import type { LedgerTransaction } from './types';
import type { LedgerProblem } from './validation';

const isStringList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

function asDrawEvent(metadata: unknown): DrawEvent | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  if (m.event === 'CYCLE_STARTED' && isStringList(m.order))
    return m as unknown as CycleStartedEvent;
  if (m.event === 'BIDDING_DRAW' && isStringList(m.eligibleMembershipIds))
    return m as unknown as DrawEvent;
  if (m.event === 'ROTATION_REDRAWN' && isStringList(m.order)) return m as unknown as DrawEvent;
  return null;
}

/** R8.3: the winner a BIDS_PUBLISHED event records, with its cycle and round. */
function bidWinnerOf(metadata: unknown): { cycle: number; round: number; id: string } | null {
  const m = metadata as Record<string, unknown> | null;
  if (!m || m.event !== 'BIDS_PUBLISHED' || typeof m.beneficiaryMembershipId !== 'string')
    return null;
  return {
    cycle: Number(m.cycleNumber),
    round: Number(m.roundNumber),
    id: m.beneficiaryMembershipId,
  };
}

/** M4: what the ledger says about one cycle up to a point: members, who left, orders, round winners. */
interface CycleState {
  start: CycleStartedEvent;
  left: Set<string>;
  /** Orders in effect: the full rotation from round 1 (draw, rotation change) or a redraw's tail. */
  segments: { fromRound: number; order: string[] }[];
  /** Round number → beneficiary recorded by a bidding result (BIDS_PUBLISHED, BIDDING_DRAW). */
  winners: Map<number, string>;
}

const sameSet = (a: readonly string[], b: ReadonlySet<string>) =>
  a.length === b.size && a.every((id) => b.has(id));

/**
 * M4, M2: the members served before `round` (each round's bidding winner, or the order in effect for
 * a fixed round), leavers left out; or what is missing to know it.
 */
function servedBefore(cycle: CycleState, round: number): Set<string> | string {
  const served = new Set<string>();
  for (let r = 1; r < round; r++) {
    const segment = cycle.segments.filter((s) => s.fromRound <= r).at(-1);
    const id = cycle.winners.get(r) ?? segment?.order[r - (segment?.fromRound ?? 1)];
    if (!id) return `round ${r} has no recorded beneficiary`;
    if (!cycle.left.has(id)) served.add(id);
  }
  return served;
}

/** M2, M4, R8.2, R12.3: the cycle's members who have not left and were not served before `round`. */
function eligibleAt(cycle: CycleState, served: ReadonlySet<string>): Set<string> {
  return new Set(cycle.start.members.filter((id) => !cycle.left.has(id) && !served.has(id)));
}

/**
 * M4, D13.1, R12.3: a redraw is exactly the cycle's members who have not left, split into those
 * served before `fromRound` and the others, who are redrawn. A not-yet-served leaver's round is
 * removed from the rotation by a ROTATION_CHANGED event recording the new order.
 */
function redrawMembershipIssue(
  event: RotationRedrawnEvent,
  cycle: CycleState | undefined,
): string | null {
  if (!cycle) return 'no CYCLE_STARTED event before the redraw';
  const served = servedBefore(cycle, event.fromRound);
  if (typeof served === 'string') return served;
  if (!sameSet(event.servedMembershipIds, served))
    return `the served members must be the beneficiaries of rounds 1 to ${event.fromRound - 1}`;
  if (!sameSet(event.eligibleMembershipIds, eligibleAt(cycle, served)))
    return "the redrawn members must be the cycle's members not served and not gone";
  return null;
}

/**
 * M2, R8.2–R8.4: a bidding result (BIDS_PUBLISHED, BIDDING_DRAW) of round r only involves the members
 * eligible at r (the cycle's members not gone and not served before r): the winner and every bidder
 * are eligible, a no-bid draw lists exactly them, and a result without bids is only for the last one.
 */
function biddingResultIssue(
  m: Record<string, unknown>,
  cycle: CycleState | undefined,
): string | null {
  if (!cycle) return 'no CYCLE_STARTED event before the bidding result';
  const round = m.roundNumber;
  if (typeof round !== 'number' || !Number.isSafeInteger(round) || round < 1)
    return 'the bidding result names its round number';
  const served = servedBefore(cycle, round);
  if (typeof served === 'string') return served;
  const eligible = eligibleAt(cycle, served);
  if (m.event === 'BIDDING_DRAW') {
    return isStringList(m.eligibleMembershipIds) && sameSet(m.eligibleMembershipIds, eligible)
      ? null
      : "the draw's eligible members must be the cycle's members not served and not gone (R8.2)";
  }
  const winner = String(m.beneficiaryMembershipId);
  if (!eligible.has(winner))
    return `the winner ${winner} is not eligible (served, gone or not a member)`;
  const bidders = Array.isArray(m.bids)
    ? (m.bids as { membershipId?: unknown }[]).map((b) => String(b?.membershipId))
    : [];
  const outsider = bidders.find((id) => !eligible.has(id));
  if (outsider !== undefined)
    return `the bidder ${outsider} is not eligible (served, gone or not a member)`;
  if (new Set(bidders).size !== bidders.length) return 'a member bid twice';
  if (bidders.length === 0 && eligible.size !== 1)
    return 'a result without bids is only for the last eligible member (R8.4)';
  return null;
}

/** R2.3, R8.3, M4: re-runs every recorded draw and matches each cycle's seed with its CYCLE_STARTED event. */
export function drawProblems(
  groupId: string,
  transactions: readonly LedgerTransaction[],
  cycles: readonly ExportCycle[],
): LedgerProblem[] {
  const problems: LedgerProblem[] = [];
  const started = new Map<number, { seq: number; event: CycleStartedEvent }>();
  const states = new Map<number, CycleState>();
  let current: CycleState | undefined;
  transactions.forEach((tx, i) => {
    if (tx.type !== 'EVENT') return;
    const m = (tx.metadata ?? {}) as Record<string, unknown>;
    const winner = bidWinnerOf(m);
    if (winner || m.event === 'BIDDING_DRAW') {
      let issue: string | null;
      try {
        issue = biddingResultIssue(m, states.get(Number(m.cycleNumber)));
      } catch {
        issue = 'the bidding result is malformed';
      }
      if (issue) problems.push({ seq: tx.seq, code: 'DRAW_MISMATCH', detail: issue });
    }
    if (winner) states.get(winner.cycle)?.winners.set(winner.round, winner.id);
    if (m.event === 'MEMBER_LEFT' && typeof m.membershipId === 'string')
      current?.left.add(m.membershipId);
    if (m.event === 'ROTATION_CHANGED' && isStringList(m.order))
      states.get(Number(m.cycleNumber))?.segments.push({ fromRound: 1, order: m.order });
    const event = asDrawEvent(m);
    if (!event) return;
    const latest = i === 0 ? genesisHash(groupId) : transactions[i - 1]!.hash;
    let issue: string | null;
    try {
      issue = drawEventProblem(groupId, event, latest);
    } catch {
      issue = 'the draw event is malformed';
    }
    if (issue) problems.push({ seq: tx.seq, code: 'DRAW_MISMATCH', detail: issue });
    if (!issue && event.event === 'CYCLE_STARTED' && event.orderSource === 'CARRIED') {
      const carried = carriedOrderIssue(event, states.get(event.cycleNumber - 1));
      if (carried) problems.push({ seq: tx.seq, code: 'DRAW_MISMATCH', detail: carried });
    }
    if (event.event === 'CYCLE_STARTED') {
      started.set(event.cycleNumber, { seq: tx.seq, event });
      current = {
        start: event,
        left: new Set(),
        segments: [{ fromRound: 1, order: event.order }],
        winners: new Map(),
      };
      states.set(event.cycleNumber, current);
    }
    if (event.event === 'BIDDING_DRAW')
      states.get(event.cycleNumber)?.winners.set(event.roundNumber, event.beneficiaryMembershipId);
    if (event.event === 'ROTATION_REDRAWN') {
      const state = states.get(event.cycleNumber);
      let redraw: string | null;
      try {
        redraw = redrawMembershipIssue(event, state);
      } catch {
        redraw = 'the redraw event is malformed';
      }
      if (redraw) problems.push({ seq: tx.seq, code: 'DRAW_MISMATCH', detail: redraw });
      state?.segments.push({ fromRound: event.fromRound, order: event.order });
    }
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
/**
 * A UUID is random hex: a "6" followed by eight more digits turns up inside one far more often than
 * real phone numbers are rare, so an account name like `payable:member:<uuid>` was wrongly flagged.
 * UUIDs are stripped out (replaced by a mark that cannot itself start a false match) before the
 * phone pattern is tried; a real number next to or inside such a string is still caught.
 */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** 2.11, 2.14: every place in the export where a phone number appears unmasked (paths only, no digits). */
export function unmaskedPhoneProblems(data: unknown): LedgerProblem[] {
  const problems: LedgerProblem[] = [];
  const walk = (value: unknown, path: string, seq: number | null): void => {
    if (typeof value === 'string') {
      if (!HEX_ID.test(value) && PHONE.test(value.replace(UUID, '#'))) {
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

/** L2: every rotation position a member has held (draws, rotation changes, current rotations). */
/**
 * M4, D40.3: the rotation in force at the end of a cycle: the order drawn or carried at its start, then
 * each vote or redraw applied in turn (a redraw replaces the tail from its round on).
 */
function finalOrder(cycle: CycleState): string[] {
  let order: string[] = [];
  for (const s of cycle.segments) order = [...order.slice(0, s.fromRound - 1), ...s.order];
  return order;
}

/**
 * D40.3: a kept order starts from the previous cycle's final order: everyone still in the cycle keeps
 * their relative position, and whoever was not in that order (a newcomer) comes after them.
 */
function carriedOrderIssue(
  event: CycleStartedEvent,
  previous: CycleState | undefined,
): string | null {
  const before = previous ? finalOrder(previous) : [];
  if (before.length === 0) {
    return `cycle ${event.cycleNumber} keeps an order but cycle ${event.cycleNumber - 1} had no order to keep`;
  }
  const members = new Set(event.members);
  // M1: someone who left and came back is a newcomer, whatever slot they had before.
  const continuing = before.filter((id) => !previous!.left.has(id));
  const kept = continuing.filter((id) => members.has(id));
  const inBefore = new Set(continuing);
  const head = event.order.slice(0, kept.length);
  const tail = event.order.slice(kept.length);
  if (!kept.every((id, i) => head[i] === id) || tail.some((id) => inBefore.has(id)))
    return 'the kept order must keep the previous positions and put newcomers last';
  // L7: when the event records join dates, newcomers are in order of join date, then id.
  const joined = event.newcomerJoinedAt;
  if (joined) {
    const at = (id: string) => (typeof joined[id] === 'string' ? Date.parse(joined[id]) : NaN);
    if (tail.some((id) => Number.isNaN(at(id)))) return 'every newcomer needs a join date';
    const sorted = [...tail].sort((a, b) => at(a) - at(b) || (a < b ? -1 : a > b ? 1 : 0));
    if (!tail.every((id, i) => sorted[i] === id))
      return 'newcomers must be in order of join date, then membership id';
  }
  return null;
}

function rotationPositions(
  transactions: readonly LedgerTransaction[],
  cycles: readonly ExportCycle[],
): Map<string, Set<number>> {
  const positions = new Map<string, Set<number>>();
  const add = (order: unknown, offset = 0) => {
    if (!isStringList(order)) return;
    order.forEach((id, i) => {
      if (!positions.has(id)) positions.set(id, new Set());
      positions.get(id)!.add(offset + i + 1);
    });
  };
  for (const cycle of cycles) add(cycle.rotation);
  for (const tx of transactions) {
    const m = tx.type === 'EVENT' ? (tx.metadata as Record<string, unknown>) : null;
    if (!m) continue;
    if (m.event === 'CYCLE_STARTED' || m.event === 'ROTATION_CHANGED') add(m.order);
    if (m.event === 'ROTATION_REDRAWN') add(m.order, Number(m.fromRound) - 1);
  }
  return positions;
}

/**
 * L2, 3.3: the tie order recorded for each payment part is the credited member's rotation position
 * (0 for a round pot), so a forged tie order cannot move a franc of fee between members.
 */
export function tieOrderProblems(
  transactions: readonly LedgerTransaction[],
  cycles: readonly ExportCycle[],
): LedgerProblem[] {
  const positions = rotationPositions(transactions, cycles);
  const problems: LedgerProblem[] = [];
  for (const tx of transactions) {
    if (tx.type !== 'PAYMENT_RECEIVED' || !Array.isArray(tx.metadata?.parts)) continue;
    for (const part of tx.metadata.parts as {
      kind?: string;
      account?: string;
      tieOrder?: number;
    }[]) {
      if (part?.kind !== 'CONTRIBUTION' && part?.kind !== 'SHORTFALL') continue;
      const parsed = parseAccount(String(part.account));
      const known = parsed?.kind === 'PAYABLE' ? positions.get(parsed.id!) : undefined;
      const wrong =
        parsed?.kind === 'POT'
          ? part.tieOrder !== 0
          : known !== undefined && !known.has(Number(part.tieOrder));
      if (wrong) {
        problems.push({
          seq: tx.seq,
          code: 'FEE_MISMATCH',
          detail: `the tie order ${String(part.tieOrder)} of ${String(part.account)} is not its rotation position`,
        });
      }
    }
  }
  return problems;
}
