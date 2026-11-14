// Bidding results against the money (M3, R8.3, R8.5, D10). A round's result is recorded by an EVENT
// before its pot moves: BIDS_PUBLISHED (the winner holds the highest bid; no bids only for the last
// eligible member, R8.4) or BIDDING_DRAW (no bids; the draw itself is re-run by the export checks).
// POT_ASSIGNED must pay that round's winner; BID_ASSESSED (entry.roundId set) must charge the winner
// exactly their bid, once; a published winning bid above zero must be assessed. M1: a round has one
// result in effect; a new one is accepted only once the previous result's POT_ASSIGNED (and its
// BID_ASSESSED, if any) were reversed. A reversed BID_ASSESSED no longer counts as assessed.

import { parseAccount } from './accounts';
import type { LedgerTransaction } from './types';
type BySeq = ReadonlyMap<number, LedgerTransaction>;
import type { LedgerProblem } from './validation';

interface RoundResult {
  seq: number;
  winner: string;
  /** The winner's bid when it came from BIDS_PUBLISHED with bids, else null. */
  winningBid: number | null;
  assessedAt: number | null;
  /** M1: the POT_ASSIGNED in effect for this result, and whether one was ever posted. */
  assignedAt: number | null;
  everAssigned: boolean;
}

const fresh = (seq: number, winner: string, winningBid: number | null): RoundResult => ({
  seq,
  winner,
  winningBid,
  assessedAt: null,
  assignedAt: null,
  everAssigned: false,
});

function resultOf(seq: number, metadata: Record<string, unknown>): RoundResult | string | null {
  if (metadata.event === 'BIDDING_DRAW' && typeof metadata.beneficiaryMembershipId === 'string')
    return fresh(seq, metadata.beneficiaryMembershipId, null);
  if (metadata.event !== 'BIDS_PUBLISHED') return null;
  const winner = metadata.beneficiaryMembershipId;
  const bids = metadata.bids as { membershipId?: unknown; amount?: unknown }[] | undefined;
  if (typeof winner !== 'string' || !Array.isArray(bids))
    return 'BIDS_PUBLISHED needs its winner and bids';
  if (bids.length === 0) return fresh(seq, winner, null);
  const amounts = bids.map((b) => b?.amount);
  if (amounts.some((a) => typeof a !== 'number' || !Number.isSafeInteger(a) || a < 0))
    return 'every published bid is a whole number of francs';
  const own = bids.find((b) => b.membershipId === winner);
  const best = Math.max(...(amounts as number[]));
  if (!own || own.amount !== best) return `the winner ${winner} does not hold the highest bid`;
  return fresh(seq, winner, best);
}

/** Tracks bidding results; call `check` for each valid transaction, then `finish`. */
export function createBidTracker() {
  const results = new Map<string, RoundResult>();
  /** M1: the round of each POT_ASSIGNED and BID_ASSESSED (by seq), so their reversal can undo them. */
  const assignedRound = new Map<number, string>();
  const assessedRound = new Map<number, string>();
  return {
    check(tx: LedgerTransaction, seq: number, bySeq: BySeq): LedgerProblem[] {
      if (tx.type === 'REVERSAL') {
        const target = bySeq.get(tx.metadata.reversesSeq as number);
        if (!target) return [];
        const assigned = results.get(assignedRound.get(target.seq) ?? '');
        if (assigned && assigned.assignedAt === target.seq) assigned.assignedAt = null;
        const assessed = results.get(assessedRound.get(target.seq) ?? '');
        if (assessed && assessed.assessedAt === target.seq) assessed.assessedAt = null;
        return [];
      }
      if (tx.type === 'EVENT') {
        const roundId = tx.metadata.roundId;
        const result = resultOf(seq, tx.metadata);
        if (result === null) return [];
        if (typeof result === 'string') return [{ seq, code: 'BID_MISMATCH', detail: result }];
        if (typeof roundId !== 'string')
          return [{ seq, code: 'BID_MISMATCH', detail: 'the event names its round' }];
        const previous = results.get(roundId);
        if (
          previous &&
          (!previous.everAssigned || previous.assignedAt !== null || previous.assessedAt !== null)
        )
          return [
            {
              seq,
              code: 'BID_MISMATCH',
              detail: `round ${roundId} already has a result (seq ${previous.seq}): reverse its POT_ASSIGNED and BID_ASSESSED first`,
            },
          ];
        results.set(roundId, result);
        return [];
      }
      if (tx.type === 'POT_ASSIGNED') {
        const lines = tx.postings.map((p) => parseAccount(p.account)!);
        const roundId = lines.find((a) => a.kind === 'POT')!.id!;
        const winner = lines.find((a) => a.kind === 'PAYABLE')!.id;
        const result = results.get(roundId);
        if (!result)
          return [
            {
              seq,
              code: 'POT_MISMATCH',
              detail: `no bidding result recorded for round ${roundId}`,
            },
          ];
        if (result.winner !== winner)
          return [
            {
              seq,
              code: 'POT_MISMATCH',
              detail: `the pot of round ${roundId} belongs to ${result.winner}`,
            },
          ];
        result.assignedAt ??= seq;
        result.everAssigned = true;
        assignedRound.set(seq, roundId);
        return [];
      }
      if (tx.type !== 'BID_ASSESSED') return [];
      const result = tx.roundId ? results.get(tx.roundId) : undefined;
      if (!result || result.winningBid === null)
        return [
          {
            seq,
            code: 'BID_MISMATCH',
            detail: 'no published winning bid for this round (roundId)',
          },
        ];
      const debtor = tx.postings
        .map((p) => parseAccount(p.account)!)
        .find((a) => a.kind === 'RECEIVABLE')!.id;
      const amount = tx.postings.find((p) => p.account.startsWith('receivable:'))!.amount;
      let detail: string | null = null;
      if (result.assessedAt !== null)
        detail = `the bid was already assessed at seq ${result.assessedAt}`;
      else if (debtor !== result.winner) detail = `the winning bid is owed by ${result.winner}`;
      else if (amount !== result.winningBid) detail = `the winning bid is ${result.winningBid}`;
      if (result.assessedAt === null) {
        result.assessedAt = seq;
        assessedRound.set(seq, tx.roundId!);
      }
      return detail ? [{ seq, code: 'BID_MISMATCH', detail }] : [];
    },
    finish(): LedgerProblem[] {
      const problems: LedgerProblem[] = [];
      for (const [roundId, r] of results) {
        if (r.winningBid !== null && r.winningBid > 0 && r.assessedAt === null)
          problems.push({
            seq: r.seq,
            code: 'BID_MISMATCH',
            detail: `the winning bid of round ${roundId} was never assessed`,
          });
      }
      return problems;
    },
  };
}
