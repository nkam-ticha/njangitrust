// Totals over a list of postings, for the services that load rows and ask the rule (2.5). The API
// used to sum postings itself; one definition here keeps the sign convention in a single place.

import { sumFcfa, type Fcfa } from '../money';
import { naturalBalance } from './accounts';
import type { Posting } from './types';

/**
 * 2.5: the balance of one account as people read it (a payable of 9 909 is 9 909), from postings
 * that may include other accounts (they are ignored). Throws on an unknown account or an amount
 * that is not a whole number of FCFA.
 */
export function accountBalance(account: string, postings: readonly Posting[]): Fcfa {
  const raw = sumFcfa(postings.filter((p) => p.account === account).map((p) => p.amount));
  return naturalBalance(account, raw);
}

/**
 * R5.2, R6: what was credited to a liability account (a payable): the sum of its negative postings,
 * as a positive number. Debits (money taken out of it) do not reduce the total.
 */
export function accountCreditsTotal(account: string, postings: readonly Posting[]): Fcfa {
  return sumFcfa(
    postings.filter((p) => p.account === account && p.amount < 0).map((p) => 0 - p.amount),
  );
}
