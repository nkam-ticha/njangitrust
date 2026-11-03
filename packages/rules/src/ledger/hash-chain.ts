// Hash chain (2.5 invariant 5, D6): hash = SHA-256(prevHash + canonicalJSON(transaction without
// hash)), postings sorted by account then amount; the first transaction uses
// prevHash = SHA-256("njangitrust:" + groupId).

import { canonicalJSON, sha256Hex, type JsonObject } from '../crypto';
import type { LedgerTransaction, LedgerEntry, Posting } from './types';
import { entryProblems, type LedgerProblem } from './validation';

/** 2.5: prevHash of a group's first transaction. Also the "latest hash" of an empty ledger (R2.3). */
export function genesisHash(groupId: string): string {
  return sha256Hex(`njangitrust:${groupId}`);
}

/** D6: postings in canonical order, by account then amount. */
export function sortPostings(postings: readonly Posting[]): Posting[] {
  return [...postings]
    .map((p) => ({ account: p.account, amount: p.amount }))
    .sort((a, b) => (a.account < b.account ? -1 : a.account > b.account ? 1 : a.amount - b.amount));
}

/** D6: the object that is hashed, every field except `hash`, postings sorted. */
export function hashContent(tx: Omit<LedgerTransaction, 'hash'>): JsonObject {
  return {
    id: tx.id,
    groupId: tx.groupId,
    seq: tx.seq,
    type: tx.type,
    occurredAt: tx.occurredAt,
    roundId: tx.roundId,
    membershipId: tx.membershipId,
    refType: tx.refType,
    refId: tx.refId,
    descriptionFr: tx.descriptionFr,
    descriptionEn: tx.descriptionEn,
    metadata: tx.metadata,
    postings: sortPostings(tx.postings).map((p) => ({ account: p.account, amount: p.amount })),
    prevHash: tx.prevHash,
  };
}

/** 2.5 invariant 5: SHA-256(prevHash + canonicalJSON(transaction without hash)). */
export function computeTransactionHash(tx: Omit<LedgerTransaction, 'hash'>): string {
  return sha256Hex(tx.prevHash + canonicalJSON(hashContent(tx)));
}

/**
 * 2.5: turns a valid entry into the next transaction of the group's chain (next seq, prevHash,
 * hash). Throws a RangeError if the entry breaks a ledger rule; nothing invalid is ever sealed.
 */
export function sealTransaction(input: {
  groupId: string;
  previous: Pick<LedgerTransaction, 'seq' | 'hash'> | null;
  entry: LedgerEntry;
}): LedgerTransaction {
  const problems = entryProblems(input.entry);
  if (problems.length > 0) {
    throw new RangeError(`invalid ledger entry: ${problems.map((p) => p.detail).join('; ')}`);
  }
  const unsealed: Omit<LedgerTransaction, 'hash'> = {
    ...input.entry,
    postings: sortPostings(input.entry.postings),
    groupId: input.groupId,
    seq: input.previous ? input.previous.seq + 1 : 1,
    prevHash: input.previous ? input.previous.hash : genesisHash(input.groupId),
  };
  return { ...unsealed, hash: computeTransactionHash(unsealed) };
}

/**
 * 2.5 invariant 5: checks seq continuity, group, prevHash links and every hash, position by
 * position. `seqs[i]` is the seq transaction i should have, so a change to any field of a stored
 * transaction is reported at exactly that seq.
 */
export function inspectChain(
  groupId: string,
  transactions: readonly LedgerTransaction[],
): { seqs: number[]; problems: LedgerProblem[][] } {
  const seqs: number[] = [];
  const all: LedgerProblem[][] = [];
  let prevStoredSeq = 0;
  let prevExpectedSeq = 0;
  let prevHash = genesisHash(groupId);
  for (const tx of transactions) {
    const problems: LedgerProblem[] = [];
    // Accept either continuation, so one renumbered or missing entry is reported once.
    const fromStored = prevStoredSeq + 1;
    const fromExpected = prevExpectedSeq + 1;
    let seq: number;
    if (tx.seq === fromStored || tx.seq === fromExpected) {
      seq = tx.seq;
    } else {
      seq = fromExpected;
      problems.push({
        seq,
        code: 'SEQ_GAP',
        detail: `expected seq ${seq}, found ${String(tx.seq)}`,
      });
    }
    if (tx.groupId !== groupId) {
      problems.push({
        seq,
        code: 'GROUP_MISMATCH',
        detail: 'transaction belongs to another group',
      });
    }
    if (tx.prevHash !== prevHash) {
      problems.push({
        seq,
        code: 'PREV_HASH_MISMATCH',
        detail: 'prevHash is not the previous hash',
      });
    }
    let recomputed: string | null = null;
    try {
      recomputed = computeTransactionHash(tx);
    } catch (error) {
      problems.push({ seq, code: 'MALFORMED_TRANSACTION', detail: (error as Error).message });
    }
    if (recomputed !== null && recomputed !== tx.hash) {
      problems.push({
        seq,
        code: 'HASH_MISMATCH',
        detail: 'stored hash does not match the content',
      });
    }
    prevStoredSeq = Number.isSafeInteger(tx.seq) ? tx.seq : seq;
    prevExpectedSeq = seq;
    prevHash = tx.hash;
    seqs.push(seq);
    all.push(problems);
  }
  return { seqs, problems: all };
}

/** 2.5 invariant 5: every problem of the hash chain, in order. Empty when the chain is intact. */
export function verifyChain(
  groupId: string,
  transactions: readonly LedgerTransaction[],
): LedgerProblem[] {
  return inspectChain(groupId, transactions).problems.flat();
}

/** 2.5 invariant 5: the first seq where the chain breaks, or null when it is intact. */
export function firstBrokenSeq(
  groupId: string,
  transactions: readonly LedgerTransaction[],
): number | null {
  return verifyChain(groupId, transactions)[0]?.seq ?? null;
}
