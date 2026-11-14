// Ledger invariants 1–5 (2.5), checked transaction by transaction so every problem carries the
// exact seq where it first appears.

import { parseAccount } from './accounts';
import { applyPostings, type Balances } from './balances';
import { createBidTracker } from './bid-checks';
import { createCorrectionTracker } from './correction-checks';
import { inspectChain, sortPostings } from './hash-chain';
import { createInFlightTracker, DISBURSEMENT_TYPES } from './inflight-checks';
import { reservedLentProblem } from './lending-checks';
import { createPotTracker } from './pot-checks';
import type { LedgerTransaction, Posting } from './types';
import { entryProblems, type LedgerProblem } from './validation';

/**
 * 2.5 invariants 2–4 (and pots): accounts that may never be below zero, read naturally:
 * member payables, round pots, in-flight disbursements, the solidarity fund and provider cash. A receivable below zero (a
 * member credited for a debt they never owed) is flagged too (audit item 8).
 */
export function negativeAccounts(
  balances: ReadonlyMap<string, number>,
): { account: string; value: number }[] {
  const out: { account: string; value: number }[] = [];
  for (const [account, raw] of balances) {
    const kind = parseAccount(account)?.kind;
    if ((kind === 'CASH' || kind === 'RECEIVABLE') && raw < 0) out.push({ account, value: raw });
    if (
      (kind === 'PAYABLE' ||
        kind === 'POT' ||
        kind === 'SOLIDARITY_FUND' ||
        kind === 'IN_FLIGHT') &&
      raw > 0
    ) {
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
  if (DISBURSEMENT_TYPES.includes(original.type))
    return `a ${original.type} is never reversed: a failed send is returned (DISBURSEMENT_RETURNED), an operator reversal refunded (DISBURSEMENT_REFUNDED)`;
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
 * reversals, unique IDs, no payable, pot, in-flight, solidarity fund, cash or receivable below zero
 * after any transaction, bidding pots assigned exactly once to the recorded winner (D10, M3), winning
 * bids assessed as published, in-flight disbursements opened once and closed once (D18.1), and
 * corrections exactly as the balances require (D15–D18), completed disbursements refunded at most
 * once and exactly (D22.1), and no reserved money lent, refunded to a leaver or distributed
 * (RESERVED_LENT, H1). Returns every problem in ledger order; empty when the ledger is sound.
 * Reserved-money coverage is current state, not integrity: see coverageGaps and reservedShortfall.
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
  const pots = createPotTracker();
  const corrections = createCorrectionTracker(pots);
  const inFlight = createInFlightTracker();
  const bids = createBidTracker();
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
    if (entryIssues.length === 0) {
      problems.push(...corrections.check(tx, seq, balances, bySeq));
      problems.push(...pots.check(tx, seq, balances, bySeq));
      problems.push(...inFlight.check(tx, seq, balances));
      problems.push(...bids.check(tx, seq, bySeq));
      const lent = reservedLentProblem(tx, seq, balances);
      if (lent) problems.push(lent);
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
  problems.push(...corrections.finish(), ...pots.finish(balances), ...bids.finish());
  return problems;
}
