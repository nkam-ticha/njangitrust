// Bidding pot checks (D10, R3.4). POT_ASSIGNED empties the pot exactly, into its winner's payable,
// which is recorded. After it the pot takes no new money; the only later postings allowed are a
// POT_CORRECTION and the REVERSAL of a payment the pot received before the assignment (D15,
// checked in correction-checks.ts). Every assigned pot ends at zero.

import { parseAccount } from './accounts';
import type { LedgerTransaction } from './types';
import type { LedgerProblem } from './validation';

const potIds = (tx: { postings: readonly { account: string }[] }): string[] =>
  tx.postings
    .map((p) => parseAccount(p.account))
    .filter((a) => a?.kind === 'POT')
    .map((a) => a!.id!);

export interface PotAssignment {
  seq: number;
  winner: string;
}

/** Tracks every pot through the ledger; call `check` for each transaction, then `finish`. */
export function createPotTracker() {
  const assigned = new Map<string, PotAssignment>();
  const lastPostingSeq = new Map<string, number>();
  return {
    /** H1: the assignment of a round's pot, if any (winner and seq). */
    assignment: (roundId: string): PotAssignment | undefined => assigned.get(roundId),
    /** `balances` are the raw balances before this transaction; `bySeq` holds earlier transactions. */
    check(
      tx: LedgerTransaction,
      seq: number,
      balances: ReadonlyMap<string, number>,
      bySeq: ReadonlyMap<number, LedgerTransaction>,
    ): LedgerProblem[] {
      const problems: LedgerProblem[] = [];
      const target =
        tx.type === 'REVERSAL' ? bySeq.get(tx.metadata.reversesSeq as number) : undefined;
      for (const roundId of new Set(potIds(tx))) {
        lastPostingSeq.set(roundId, seq);
        const account = `pot:round:${roundId}`;
        if (tx.type === 'POT_ASSIGNED') {
          if (assigned.has(roundId)) {
            problems.push({ seq, code: 'POT_MISMATCH', detail: `${account} is already assigned` });
            continue;
          }
          const before = 0 - (balances.get(account) ?? 0);
          const moved = tx.postings.find((p) => p.account === account)?.amount ?? 0;
          if (moved !== before) {
            problems.push({
              seq,
              code: 'POT_MISMATCH',
              detail: `${account} holds ${before}, POT_ASSIGNED moved ${moved}`,
            });
          }
          const winner = tx.postings
            .map((p) => parseAccount(p.account))
            .find((a) => a?.kind === 'PAYABLE')?.id;
          assigned.set(roundId, { seq, winner: winner ?? '' });
          continue;
        }
        const assignment = assigned.get(roundId);
        if (!assignment) continue;
        if (target?.type === 'POT_ASSIGNED') {
          assigned.delete(roundId); // the assignment itself was reversed: the pot is open again
          continue;
        }
        const allowed =
          tx.type === 'POT_CORRECTION' ||
          (target !== undefined && target.seq < assignment.seq && potIds(target).includes(roundId));
        if (!allowed) {
          problems.push({
            seq,
            code: 'POT_MISMATCH',
            detail: `${account} was already assigned at seq ${assignment.seq}`,
          });
        }
      }
      return problems;
    },
    /** Every assigned pot must end at zero. `balances` are the final raw balances. */
    finish(balances: ReadonlyMap<string, number>): LedgerProblem[] {
      const problems: LedgerProblem[] = [];
      for (const roundId of assigned.keys()) {
        const left = 0 - (balances.get(`pot:round:${roundId}`) ?? 0);
        if (left !== 0) {
          problems.push({
            seq: lastPostingSeq.get(roundId) ?? null,
            code: 'POT_MISMATCH',
            detail: `pot:round:${roundId} still holds ${left} after its assignment`,
          });
        }
      }
      return problems;
    },
  };
}
