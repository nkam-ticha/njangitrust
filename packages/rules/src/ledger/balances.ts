// Account balances computed from postings (2.5). Raw balances keep the sign convention (debit
// positive); summaries read them the way people do (a payable of 9 909 is 9 909).

import { naturalBalance, parseAccount } from './accounts';
import type { Posting } from './types';

/** Raw balance per account: the sum of its postings, debit positive. */
export type Balances = Map<string, number>;

/**
 * N5 (audit 5): adds postings to a copy of the balances, or returns null when the result would leave
 * the safe integer range: any balance, or the total size of all balances (the sum of their absolute
 * values), above Number.MAX_SAFE_INTEGER. Within that bound every total and difference the checks
 * form (summaries, available for loans, coverage) is exact. The checks report such a transaction
 * and skip it instead of throwing.
 */
export function tryApplyPostings(
  balances: ReadonlyMap<string, number>,
  postings: readonly Posting[],
): Balances | null {
  const next = new Map(balances);
  for (const p of postings) {
    const sum = (next.get(p.account) ?? 0) + p.amount;
    if (!Number.isSafeInteger(sum)) return null;
    next.set(p.account, sum);
  }
  let size = 0;
  for (const value of next.values()) {
    // Exact until it passes the limit: every partial sum below it is a safe integer.
    size += Math.abs(value);
    if (size > Number.MAX_SAFE_INTEGER) return null;
  }
  return next;
}

/** 2.5: adds postings to a copy of the balances; throws when they leave the safe range (N5). */
export function applyPostings(
  balances: ReadonlyMap<string, number>,
  postings: readonly Posting[],
): Balances {
  const next = tryApplyPostings(balances, postings);
  if (!next) throw new RangeError('the balances would leave the safe integer range');
  return next;
}

/** 2.5: balances of every account after the given transactions. */
export function computeBalances(
  transactions: readonly { postings: readonly Posting[] }[],
): Balances {
  let balances: Balances = new Map();
  for (const tx of transactions) balances = applyPostings(balances, tx.postings);
  return balances;
}

/**
 * N5: balances after the given transactions, skipping those that would leave the safe integer range
 * (as checkLedger does), with the index of each one skipped.
 */
export function computeBalancesSkippingUnsafe(
  transactions: readonly { postings: readonly Posting[] }[],
): { balances: Balances; skipped: number[] } {
  let balances: Balances = new Map();
  const skipped: number[] = [];
  transactions.forEach((tx, i) => {
    const next = tryApplyPostings(balances, tx.postings);
    if (next) balances = next;
    else skipped.push(i);
  });
  return { balances, skipped };
}

/** 2.5: a group's balances as people read them. */
export interface BalanceSummary {
  cash: number;
  generalFund: number;
  solidarityFund: number;
  /** Sum of all payable:member:* (money reserved for members). */
  payables: number;
  /** Sum of all pot:round:* (bidding rounds before the close). */
  pots: number;
  /** Sum of all receivable:member:* (debts owed to the general fund). */
  receivables: number;
  /** D18.1: sum of all inflight:disbursement:* (sent to the provider, not yet confirmed). */
  inFlight: number;
  payableByMember: Record<string, number>;
  receivableByMember: Record<string, number>;
  potByRound: Record<string, number>;
  inFlightByOperation: Record<string, number>;
}

/** 2.5: the summary of raw balances; throws on an unknown account name. */
export function summarizeBalances(balances: ReadonlyMap<string, number>): BalanceSummary {
  const summary: BalanceSummary = {
    cash: 0,
    generalFund: 0,
    solidarityFund: 0,
    payables: 0,
    pots: 0,
    receivables: 0,
    inFlight: 0,
    payableByMember: {},
    receivableByMember: {},
    potByRound: {},
    inFlightByOperation: {},
  };
  for (const [account, raw] of balances) {
    const parsed = parseAccount(account);
    if (!parsed) throw new RangeError(`unknown account ${account}`);
    const value = naturalBalance(account, raw);
    switch (parsed.kind) {
      case 'CASH':
        summary.cash += value;
        break;
      case 'GENERAL_FUND':
        summary.generalFund += value;
        break;
      case 'SOLIDARITY_FUND':
        summary.solidarityFund += value;
        break;
      case 'PAYABLE':
        summary.payables += value;
        summary.payableByMember[parsed.id!] = value;
        break;
      case 'RECEIVABLE':
        summary.receivables += value;
        summary.receivableByMember[parsed.id!] = value;
        break;
      case 'POT':
        summary.pots += value;
        summary.potByRound[parsed.id!] = value;
        break;
      case 'IN_FLIGHT':
        summary.inFlight += value;
        summary.inFlightByOperation[parsed.id!] = value;
        break;
    }
  }
  return summary;
}
