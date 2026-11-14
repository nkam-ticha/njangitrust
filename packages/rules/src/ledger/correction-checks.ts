// Checks of the corrections before a REVERSAL (D15, D16.1, D17, D18). Each POT_CORRECTION or
// CLAWBACK names the payment it prepares (metadata.forReversalOfSeq) and must move exactly what the
// ledger balances before it require (never a self-declared figure, H2); at most one correction per
// (payment, account) in a block; the block must be followed by that payment's REVERSAL. A solidarity
// shortfall follows D18.3 (newest payout first, capped, then the payer), paid from the debtor's
// payable first. L2: a correction can only be reversed once its block's REVERSAL has been reversed.
// L4: a disbursement entry (send, completion, return, refund) is never the target of a correction.

import { naturalBalance, parseAccount, payableAccount, SOLIDARITY_FUND } from './accounts';
import { creditsTo } from './corrections';
import { DISBURSEMENT_TYPES } from './inflight-checks';
import type { createPotTracker } from './pot-checks';
import { createSolidarityHistory } from './solidarity-history';
import type { LedgerTransaction } from './types';
import type { LedgerProblem } from './validation';

type Pots = Pick<ReturnType<typeof createPotTracker>, 'assignment'>;
type Held = (account: string) => number;
type Line = { kind: string; id: string | null; account: string; amount: number };

const linesOf = (tx: LedgerTransaction): Line[] =>
  tx.postings.map((p) => ({ ...parseAccount(p.account)!, account: p.account, amount: p.amount }));

function potCorrectionIssue(
  tx: LedgerTransaction,
  target: LedgerTransaction,
  held: Held,
  pots: Pots,
) {
  const lines = linesOf(tx);
  const pot = lines.find((l) => l.kind === 'POT')!;
  const amount = -pot.amount;
  const assignment = pots.assignment(pot.id!);
  if (!assignment) return { key: pot.account, issue: `${pot.account} is not assigned` };
  const issue = (() => {
    if (target.seq >= assignment.seq) return 'the payment to reverse came after the assignment';
    if (creditsTo(target.postings, pot.account) !== amount)
      return 'the amount differs from what the payment put in the pot';
    if (tx.membershipId !== assignment.winner)
      return `only the winner ${assignment.winner} can be corrected`;
    const fromPayable = lines.find((l) => l.kind === 'PAYABLE')?.amount ?? 0;
    const expected = Math.min(amount, held(payableAccount(assignment.winner)));
    return fromPayable === expected ? null : `the winner's payable part should be ${expected}`;
  })();
  return { key: pot.account, issue };
}

/** Tracks correction blocks; call `check` for each valid transaction, then `finish`. */
export function createCorrectionTracker(pots: Pots) {
  let pending: { target: number; lastSeq: number; keys: Set<string> } | null = null;
  const history = createSolidarityHistory();
  /** Payment seq → the seq of the REVERSAL that closed its correction block. */
  const blockReversal = new Map<number, number>();
  const reversed = new Set<number>();

  function clawbackIssue(tx: LedgerTransaction, target: LedgerTransaction, held: Held) {
    const lines = linesOf(tx);
    const fund = lines.find((l) => l.kind === 'SOLIDARITY_FUND');
    const payable = lines.find((l) => l.kind === 'PAYABLE');
    const receivable = lines.find((l) => l.kind === 'RECEIVABLE')?.amount ?? 0;
    if (!fund) {
      const key = payable!.account;
      const credited = creditsTo(target.postings, key);
      if (credited === 0) return { key, issue: `the payment to reverse did not credit ${key}` };
      const expected = Math.max(0, credited - held(key));
      return { key, issue: receivable === expected ? null : `the clawback should be ${expected}` };
    }
    const payoutSeq = (tx.metadata.solidarityPayoutSeq as number | null) ?? null;
    const key = `${SOLIDARITY_FUND}#${payoutSeq ?? 'payer'}`;
    const shortfall = Math.max(
      0,
      creditsTo(target.postings, SOLIDARITY_FUND) - held(SOLIDARITY_FUND),
    );
    if (shortfall === 0)
      return { key, issue: 'the solidarity fund already holds what the payment credited' };
    const payer = target.type === 'PAYMENT_RECEIVED' ? target.membershipId : null;
    let next;
    try {
      next = history.allocate(shortfall, payer)[0]!;
    } catch {
      return { key, issue: 'no recipient or payer can owe the solidarity shortfall' };
    }
    const owes = next.payoutSeq === null ? 'the payer' : `the recipient of seq ${next.payoutSeq}`;
    if (tx.membershipId !== next.debtorMembershipId || payoutSeq !== next.payoutSeq)
      return {
        key,
        issue: `the next part of the shortfall is owed by ${owes} (${next.debtorMembershipId})`,
      };
    if (-fund.amount !== next.amount)
      return { key, issue: `the clawback should be ${next.amount}` };
    const debtorPayable = payableAccount(next.debtorMembershipId);
    const free = Math.max(0, held(debtorPayable) - creditsTo(target.postings, debtorPayable));
    const fromPayable = Math.min(next.amount, free);
    return {
      key,
      issue:
        (payable?.amount ?? 0) === fromPayable
          ? null
          : `the debtor's payable part should be ${fromPayable}`,
    };
  }

  return {
    /** `balances` are the raw balances before this transaction. */
    check(
      tx: LedgerTransaction,
      seq: number,
      balances: ReadonlyMap<string, number>,
      bySeq: ReadonlyMap<number, LedgerTransaction>,
    ): LedgerProblem[] {
      const problems: LedgerProblem[] = [];
      const mismatch = (detail: string) =>
        problems.push({ seq, code: 'CORRECTION_MISMATCH', detail });
      const isCorrection = tx.type === 'POT_CORRECTION' || tx.type === 'CLAWBACK';
      const targetSeq = isCorrection ? (tx.metadata.forReversalOfSeq as number) : null;
      if (pending) {
        const continues = isCorrection && targetSeq === pending.target;
        const ends = tx.type === 'REVERSAL' && tx.metadata.reversesSeq === pending.target;
        if (!continues && !ends)
          mismatch(`the corrections for seq ${pending.target} must be followed by its REVERSAL`);
        if (ends) blockReversal.set(pending.target, seq);
        if (!continues) pending = null;
      }
      if (tx.type === 'REVERSAL') {
        const target = bySeq.get(tx.metadata.reversesSeq as number);
        if (target && (target.type === 'POT_CORRECTION' || target.type === 'CLAWBACK')) {
          const closing = blockReversal.get(target.metadata.forReversalOfSeq as number);
          if (closing === undefined || !reversed.has(closing))
            mismatch(
              'a correction can only be reversed after the REVERSAL it prepared is itself reversed (L2)',
            );
        }
        reversed.add(tx.metadata.reversesSeq as number);
      }
      if (isCorrection && targetSeq !== null) {
        const target = bySeq.get(targetSeq);
        const held: Held = (account) =>
          Math.max(0, naturalBalance(account, balances.get(account) ?? 0));
        let result: { key: string; issue: string | null };
        if (target && DISBURSEMENT_TYPES.includes(target.type)) {
          // L4: sends, completions, returns and refunds are never reversed (D18.1, D22.1).
          result = {
            key: '',
            issue: `seq ${targetSeq}: a ${target.type} is never reversed, so no correction prepares it`,
          };
        } else if (
          !target ||
          ['EVENT', 'REVERSAL', 'POT_CORRECTION', 'CLAWBACK'].includes(target.type)
        ) {
          result = { key: '', issue: `seq ${targetSeq} is not a transaction that can be reversed` };
        } else {
          result =
            tx.type === 'POT_CORRECTION'
              ? potCorrectionIssue(tx, target, held, pots)
              : clawbackIssue(tx, target, held);
        }
        if (!pending) pending = { target: targetSeq, lastSeq: seq, keys: new Set() };
        if (result.key && pending.keys.has(result.key))
          mismatch(`only one correction per account (${result.key}) before a REVERSAL`);
        else if (result.issue) mismatch(result.issue);
        pending.keys.add(result.key);
        pending.lastSeq = seq;
      }
      history.observe({ ...tx, seq });
      return problems;
    },
    finish(): LedgerProblem[] {
      if (!pending) return [];
      return [
        {
          seq: pending.lastSeq,
          code: 'CORRECTION_MISMATCH',
          detail: `the corrections for seq ${pending.target} are not followed by its REVERSAL`,
        },
      ];
    },
  };
}
