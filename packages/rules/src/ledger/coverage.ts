// Reserved-money coverage over time (D16.2, H1). Coverage is the ledger's current state, not its
// integrity: a reversal can leave cash below what is reserved for members, pots, the solidarity fund
// and payouts in flight until the debts it created are paid. The daily check is ALERT while it
// lasts (reconcile with the CURRENT reservedShortfall); once covered again, the status returns to OK.

import type { Fcfa } from '../money';
import { parseAccount } from './accounts';
import { summarizeBalances, tryApplyPostings, type Balances } from './balances';
import { reservedShortfall } from './derived';
import type { Posting } from './types';
import type { LedgerWarning } from './validation';

/** D16.2: one period during which cash did not cover reserved money; `toSeq` null = still now. */
export interface CoverageGap {
  fromSeq: number;
  toSeq: number | null;
  largestShortfall: Fcfa;
}

const sound = (postings: unknown): Posting[] =>
  Array.isArray(postings)
    ? (postings as Posting[]).filter(
        (p) => parseAccount(p?.account ?? '') && Number.isSafeInteger(p.amount),
      )
    : [];

/** D16.2, H1: every period of the ledger during which reserved money was not covered by cash. */
export function coverageGaps(
  transactions: readonly { seq: number; postings: readonly Posting[] }[],
): CoverageGap[] {
  const gaps: CoverageGap[] = [];
  let balances: Balances = new Map();
  let open: CoverageGap | null = null;
  transactions.forEach((tx, i) => {
    const seq = Number.isSafeInteger(tx.seq) ? tx.seq : i + 1;
    // N5: a transaction that would leave the safe integer range is skipped (checkLedger reports it).
    balances = tryApplyPostings(balances, sound(tx.postings)) ?? balances;
    const shortfall = reservedShortfall(summarizeBalances(balances));
    if (shortfall > 0) {
      if (!open) {
        open = { fromSeq: seq, toSeq: null, largestShortfall: shortfall };
        gaps.push(open);
      } else open.largestShortfall = Math.max(open.largestShortfall, shortfall);
    } else if (open) {
      open.toSeq = seq;
      open = null;
    }
  });
  return gaps;
}

/** H1: the warning to show for the ledger as it stands now (empty when reserved money is covered). */
export function coverageWarnings(balances: ReadonlyMap<string, number>): LedgerWarning[] {
  const shortfall = reservedShortfall(summarizeBalances(balances));
  return shortfall > 0
    ? [
        {
          code: 'RESERVED_NOT_COVERED',
          detail: `uncovered now: ${shortfall} (cash below payables, pots, solidarity fund and payouts in flight)`,
        },
      ]
    : [];
}
