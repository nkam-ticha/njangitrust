// CLAWBACK_RELEASE (owner decisions Q1 and Q3 of 2026-11-14). A solidarity payout's money that comes
// back to the fund (its send returned, or its completion refunded by the operator) releases the
// solidarity clawbacks it made unnecessary (see solidarity-history.ts for which ones and how much):
// an unpaid clawback debt is cancelled against the fund (receivable credit), an amount already paid
// is credited back to the debtor's payable; never more than the clawback. A clawback is still never
// reversed alone (L2 of audit 3): the release is its own entry, right after the return or refund.

import { assertNonNegativeFcfa, type Fcfa } from '../money';
import { payableAccount, receivableAccount, SOLIDARITY_FUND } from './accounts';
import { post } from './lines';
import { createSolidarityHistory } from './solidarity-history';
import type { LedgerTransaction, Posting } from './types';

/** Q1, Q3: fund:solidarity +(fromDebt + toPayable), receivable −fromDebt, payable −toPayable. */
export function clawbackReleasePostings(input: {
  debtorMembershipId: string;
  /** The part that cancels the debt still unpaid. */
  fromDebt: Fcfa;
  /** The part credited back to the payable (debt already paid, or taken from the payable). */
  toPayable: Fcfa;
}): Posting[] {
  assertNonNegativeFcfa(input.fromDebt, 'fromDebt');
  assertNonNegativeFcfa(input.toPayable, 'toPayable');
  const total = input.fromDebt + input.toPayable;
  if (total === 0) throw new RangeError('a release must be above zero');
  const out: Posting[] = [{ account: SOLIDARITY_FUND, amount: total }];
  post(out, receivableAccount(input.debtorMembershipId), -input.fromDebt);
  post(out, payableAccount(input.debtorMembershipId), -input.toPayable);
  return out;
}

/** One CLAWBACK_RELEASE to post, in order, right after the return or refund. */
export interface PlannedRelease {
  type: 'CLAWBACK_RELEASE';
  membershipId: string;
  postings: Posting[];
  metadata: { clawbackSeq: number; releasedBySeq: number };
  /** What the fund gives back. */
  amount: Fcfa;
  fromDebt: Fcfa;
  toPayable: Fcfa;
  /**
   * What remains of the clawback's debt after this release. When `fromDebt` > 0 the service
   * replaces the CORRECTION obligation of this clawback by one of `debtLeft` (none when 0).
   */
  debtLeft: Fcfa;
}

/**
 * Q1, Q3: the releases to seal right after `returned` (a DISBURSEMENT_RETURNED or
 * DISBURSEMENT_REFUNDED already in `ledger`, usually its last entry), in the order the ledger checks
 * require; empty when it is not a solidarity payout or nothing needs releasing. The amounts come from
 * the ledger only (H2); `debtUnpaid(clawbackSeq)` says whether the CORRECTION obligation created from
 * that clawback's receivable line is still DUE: its unpaid debt is cancelled first, the rest is
 * credited to the payable.
 */
export function planClawbackReleases(input: {
  ledger: readonly LedgerTransaction[];
  returned: Pick<LedgerTransaction, 'seq' | 'type' | 'metadata'>;
  debtUnpaid: (clawbackSeq: number) => boolean;
}): PlannedRelease[] {
  const history = createSolidarityHistory();
  for (const tx of input.ledger) if (tx.seq < input.returned.seq) history.observe(tx);
  return history.releasesFor(input.returned).map((r) => {
    const fromDebt = input.debtUnpaid(r.clawbackSeq) ? Math.min(r.amount, r.debtLeft) : 0;
    const toPayable = r.amount - fromDebt;
    return {
      type: 'CLAWBACK_RELEASE',
      membershipId: r.debtorMembershipId,
      postings: clawbackReleasePostings({
        debtorMembershipId: r.debtorMembershipId,
        fromDebt,
        toPayable,
      }),
      metadata: { clawbackSeq: r.clawbackSeq, releasedBySeq: input.returned.seq },
      amount: r.amount,
      fromDebt,
      toPayable,
      debtLeft: r.debtLeft - fromDebt,
    };
  });
}
