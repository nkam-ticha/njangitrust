// Reserved money is never lent, refunded or distributed (H1; 2.5 "available for loans", R5.6, R7.2,
// R12.3 step 1, R9.3). Coverage itself is current state (coverage.ts), but the general fund may only
// give away what is available when it decides to: a loan sent (P + estimated fee), a leaver refund
// (F) and a fund distribution (the sum of the shares) must each fit in availableForLoans of the
// balances just before them. Completions and refunds are the provider's answer, not a decision: they
// are exempt (R4.3, D22.1); a gap a reversal opens stays a warning (D16.2).

import { parseAccount } from './accounts';
import { summarizeBalances } from './balances';
import { availableForLoans } from './derived';
import type { LedgerTransaction } from './types';
import type { LedgerProblem } from './validation';

const credited = (tx: LedgerTransaction, kind: 'PAYABLE' | 'IN_FLIGHT'): number =>
  tx.postings
    .filter((p) => parseAccount(p.account)?.kind === kind && p.amount < 0)
    .reduce((sum, p) => sum - p.amount, 0);

/** H1: RESERVED_LENT when a loan, leaver refund or distribution exceeds what was available. */
export function reservedLentProblem(
  tx: LedgerTransaction,
  seq: number,
  /** Raw balances before this transaction. */
  balances: ReadonlyMap<string, number>,
): LedgerProblem | null {
  let what: string;
  let amount: number;
  if (tx.type === 'DISBURSEMENT_SENT' && tx.metadata.purpose === 'LOAN') {
    what = 'the loan sent (principal and estimated fee)';
    amount = credited(tx, 'IN_FLIGHT');
  } else if (tx.type === 'LEAVER_REFUND') {
    what = 'the leaver refund';
    amount = credited(tx, 'PAYABLE');
  } else if (tx.type === 'FUND_DISTRIBUTION') {
    what = 'the fund distribution';
    amount = credited(tx, 'PAYABLE');
  } else return null;
  const available = availableForLoans({ summary: summarizeBalances(balances) });
  if (amount <= available) return null;
  return {
    seq,
    code: 'RESERVED_LENT',
    detail: `${what} gives ${amount} while only ${available} is available (cash less payables, pots, solidarity fund and payouts in flight)`,
  };
}
