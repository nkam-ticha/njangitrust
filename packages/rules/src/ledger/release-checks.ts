// Checks of CLAWBACK_RELEASE (owner decisions Q1 and Q3). After the return or refund of a solidarity
// payout, the releases its money requires (solidarity-history.ts `releasesFor`) must follow at once,
// in that order, each exactly: the right clawback and debtor, the amount the ledger gives, and never
// more cancelled debt than is left of the clawback's. Any other CLAWBACK_RELEASE is a problem.

import { parseAccount } from './accounts';
import type { createSolidarityHistory, RequiredRelease } from './solidarity-history';
import type { LedgerTransaction } from './types';
import type { LedgerProblem } from './validation';

type History = Pick<ReturnType<typeof createSolidarityHistory>, 'releasesFor'>;

function releaseIssue(
  tx: LedgerTransaction,
  expected: RequiredRelease,
  bySeq: number,
): string | null {
  const who = `clawback seq ${expected.clawbackSeq} (${expected.debtorMembershipId})`;
  if (tx.metadata.clawbackSeq !== expected.clawbackSeq || tx.metadata.releasedBySeq !== bySeq)
    return `the next release after seq ${bySeq} is ${who}`;
  if (tx.membershipId !== expected.debtorMembershipId) return `the release concerns ${who}`;
  const lines = tx.postings.map((p) => ({ kind: parseAccount(p.account)!.kind, amount: p.amount }));
  const fund = lines.find((l) => l.kind === 'SOLIDARITY_FUND')?.amount ?? 0;
  if (fund !== expected.amount) return `the release of ${who} should be ${expected.amount}`;
  const fromDebt = -(lines.find((l) => l.kind === 'RECEIVABLE')?.amount ?? 0);
  if (fromDebt > expected.debtLeft)
    return `only ${expected.debtLeft} of the debt of ${who} is left to cancel`;
  return null;
}

/** Tracks the releases each solidarity return or refund requires; call `check` per valid entry. */
export function createReleaseTracker(history: History) {
  let required: { bySeq: number; items: RequiredRelease[] } | null = null;
  return {
    /** Call before the history observes `tx`. */
    check(tx: LedgerTransaction, seq: number): LedgerProblem[] {
      const problems: LedgerProblem[] = [];
      const mismatch = (detail: string) =>
        problems.push({ seq, code: 'CORRECTION_MISMATCH', detail });
      const next = required?.items[0];
      if (tx.type === 'CLAWBACK_RELEASE') {
        if (!required || !next)
          mismatch('a CLAWBACK_RELEASE only follows the return or refund of a solidarity payout');
        else {
          const issue = releaseIssue(tx, next, required.bySeq);
          if (issue) mismatch(issue);
          required.items.shift();
        }
      } else if (required && next) {
        mismatch(
          `the return at seq ${required.bySeq} must be followed by the release of clawback seq ${next.clawbackSeq} (${next.amount})`,
        );
        required = null;
      }
      if (tx.type === 'DISBURSEMENT_RETURNED' || tx.type === 'DISBURSEMENT_REFUNDED') {
        const items = history.releasesFor(tx);
        required = items.length > 0 ? { bySeq: seq, items } : null;
      }
      return problems;
    },
    finish(): LedgerProblem[] {
      const next = required?.items[0];
      if (!required || !next) return [];
      return [
        {
          seq: required.bySeq,
          code: 'CORRECTION_MISMATCH',
          detail: `the return at seq ${required.bySeq} must be followed by the release of clawback seq ${next.clawbackSeq} (${next.amount})`,
        },
      ];
    },
  };
}
