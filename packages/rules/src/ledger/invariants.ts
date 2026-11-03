// Ledger invariants 1–5 (2.5), checked transaction by transaction so every problem carries the
// exact seq where it first appears.

import { parseAccount } from './accounts';
import { applyPostings, type Balances } from './balances';
import { inspectChain, sortPostings } from './hash-chain';
import type { LedgerTransaction, Posting } from './types';
import { entryProblems, type LedgerProblem } from './validation';

/**
 * 2.5 invariants 2–4 (and pots): accounts that may never be below zero, read naturally:
 * member payables, round pots, the solidarity fund and provider cash.
 */
export function negativeAccounts(
  balances: ReadonlyMap<string, number>,
): { account: string; value: number }[] {
  const out: { account: string; value: number }[] = [];
  for (const [account, raw] of balances) {
    const kind = parseAccount(account)?.kind;
    if (kind === 'CASH' && raw < 0) out.push({ account, value: raw });
    if ((kind === 'PAYABLE' || kind === 'POT' || kind === 'SOLIDARITY_FUND') && raw > 0) {
      out.push({ account, value: -raw });
    }
  }
  return out.sort((a, b) => (a.account < b.account ? -1 : a.account > b.account ? 1 : 0));
}

function samePostings(a: readonly Posting[], b: readonly Posting[]): boolean {
  const x = sortPostings(a);
  const y = sortPostings(b);
  return (
    x.length === y.length &&
    x.every((p, i) => p.account === y[i]!.account && p.amount === y[i]!.amount)
  );
}

function reversalProblem(
  tx: LedgerTransaction,
  bySeq: ReadonlyMap<number, LedgerTransaction>,
  reversed: Set<number>,
): string | null {
  const target = tx.metadata.reversesSeq;
  if (typeof target !== 'number' || target >= tx.seq)
    return 'a REVERSAL must reference an earlier seq';
  const original = bySeq.get(target);
  if (!original) return `seq ${target} does not exist`;
  if (original.type === 'EVENT') return 'an EVENT cannot be reversed';
  if (reversed.has(target)) return `seq ${target} is already reversed`;
  if (tx.refId !== original.id) return 'refId must be the reversed transaction ID';
  const negated = original.postings.map((p) => ({ account: p.account, amount: 0 - p.amount }));
  if (!samePostings(negated, tx.postings))
    return `postings are not the exact negation of seq ${target}`;
  reversed.add(target);
  return null;
}

/**
 * 2.5 invariants 1–5: hash chain and gap-free seq, valid entries that sum to zero, exact
 * reversals, unique IDs, and no payable, pot, solidarity fund or cash below zero after any
 * transaction. Returns every problem in ledger order; empty when the ledger is sound.
 */
export function checkLedger(
  groupId: string,
  transactions: readonly LedgerTransaction[],
): LedgerProblem[] {
  const chain = inspectChain(groupId, transactions);
  const problems: LedgerProblem[] = [];
  const seenIds = new Set<string>();
  const bySeq = new Map<number, LedgerTransaction>();
  const reversed = new Set<number>();
  const negative = new Set<string>();
  let balances: Balances = new Map();
  transactions.forEach((tx, index) => {
    const seq = chain.seqs[index]!;
    problems.push(...chain.problems[index]!);
    const entryIssues = entryProblems(tx);
    for (const issue of entryIssues) problems.push({ seq, ...issue });
    if (seenIds.has(tx.id))
      problems.push({ seq, code: 'DUPLICATE_ID', detail: `id ${tx.id} is used twice` });
    seenIds.add(tx.id);
    if (tx.type === 'REVERSAL' && entryIssues.length === 0) {
      const issue = reversalProblem(tx, bySeq, reversed);
      if (issue) problems.push({ seq, code: 'REVERSAL_MISMATCH', detail: issue });
    }
    if (Number.isSafeInteger(tx.seq)) bySeq.set(tx.seq, tx);
    const postings = Array.isArray(tx.postings)
      ? tx.postings.filter((p) => parseAccount(p?.account ?? '') && Number.isSafeInteger(p.amount))
      : [];
    balances = applyPostings(balances, postings);
    const nowNegative = negativeAccounts(balances);
    for (const { account, value } of nowNegative) {
      if (!negative.has(account)) {
        problems.push({ seq, code: 'NEGATIVE_BALANCE', detail: `${account} is ${value}` });
      }
    }
    negative.clear();
    for (const { account } of nowNegative) negative.add(account);
  });
  return problems;
}
