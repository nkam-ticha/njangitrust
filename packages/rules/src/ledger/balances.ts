// Account balances computed from postings (2.5). Raw balances keep the sign convention (debit
// positive); summaries read them the way people do (a payable of 9 909 is 9 909).

import { naturalBalance, parseAccount } from './accounts';
import type { Posting } from './types';

/** Raw balance per account: the sum of its postings, debit positive. */
export type Balances = Map<string, number>;

/** 2.5: adds postings to a copy of the balances. */
export function applyPostings(
  balances: ReadonlyMap<string, number>,
  postings: readonly Posting[],
): Balances {
  const next = new Map(balances);
  for (const p of postings) {
    const sum = (next.get(p.account) ?? 0) + p.amount;
    if (!Number.isSafeInteger(sum))
      throw new RangeError(`balance of ${p.account} left the safe range`);
    next.set(p.account, sum);
  }
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
  payableByMember: Record<string, number>;
  receivableByMember: Record<string, number>;
  potByRound: Record<string, number>;
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
    payableByMember: {},
    receivableByMember: {},
    potByRound: {},
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
    }
  }
  return summary;
}
