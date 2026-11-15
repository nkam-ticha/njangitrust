// Corrections before a REVERSAL of money already paid out (D15, D16.1, D17, D18). The provider took a
// payment back, but its money may already have left the payable, pot or solidarity fund it credited.
// Before the exact REVERSAL, correction entries put the money back:
// - POT_CORRECTION: the bid winner's payable back into the pot (D15);
// - CLAWBACK: the rest of what a payable no longer holds becomes its owner's receivable (D16.1);
//   what the solidarity fund no longer holds is owed by the latest recipients, each capped at their
//   payout, finally by the payer (D18.3), from their payable first, the rest as a receivable (D16.1).
// "Held" is always the ledger balance: disbursements in flight have already left their source (D18.1).

import { assertNonNegativeFcfa, type Fcfa } from '../money';
import {
  naturalBalance,
  parseAccount,
  payableAccount,
  receivableAccount,
  SOLIDARITY_FUND,
} from './accounts';
import { applyPostings, computeBalances } from './balances';
import { DISBURSEMENT_TYPES } from './inflight-checks';
import { potCorrectionPostings } from './postings';
import { createSolidarityHistory } from './solidarity-history';
import type { LedgerTransaction, Posting, TransactionType } from './types';

/**
 * D16.1: a payable CLAWBACK refills the debtor's payable by `amount` and makes it their receivable.
 * D18.3: a solidarity CLAWBACK refills the fund by `amount`, paid from the debtor's payable first
 * (`fromPayable`), the rest becoming their receivable.
 */
export function clawbackPostings(
  input:
    | { debtorMembershipId: string; from: 'PAYABLE'; amount: Fcfa }
    | { debtorMembershipId: string; from: 'SOLIDARITY_FUND'; amount: Fcfa; fromPayable: Fcfa },
): Posting[] {
  assertNonNegativeFcfa(input.amount, 'clawback');
  if (input.amount === 0) throw new RangeError('a clawback must be above zero');
  const payable = payableAccount(input.debtorMembershipId);
  const receivable = receivableAccount(input.debtorMembershipId);
  if (input.from === 'PAYABLE') {
    return [
      { account: receivable, amount: input.amount },
      { account: payable, amount: -input.amount },
    ];
  }
  assertNonNegativeFcfa(input.fromPayable, 'fromPayable');
  if (input.fromPayable > input.amount) throw new RangeError('fromPayable is above the clawback');
  const out: Posting[] = [{ account: SOLIDARITY_FUND, amount: -input.amount }];
  if (input.fromPayable > 0) out.push({ account: payable, amount: input.fromPayable });
  if (input.amount > input.fromPayable)
    out.push({ account: receivable, amount: input.amount - input.fromPayable });
  return out;
}

/** One correction to post, in order, right before the REVERSAL. */
export interface PlannedCorrection {
  type: Extract<TransactionType, 'POT_CORRECTION' | 'CLAWBACK'>;
  membershipId: string;
  postings: Posting[];
  metadata: { forReversalOfSeq: number; solidarityPayoutSeq?: number | null };
}

/**
 * D15, D16.1, D18.3: the CORRECTION obligations to create for a correction block: one for each
 * correction whose receivable line is a debit (what its member now owes), with its position in the
 * plan so the service links the obligation to that entry's seq (needed later for CLAWBACK_RELEASE).
 */
export function correctionDebts(
  plan: readonly Pick<PlannedCorrection, 'membershipId' | 'postings'>[],
): { index: number; membershipId: string; amount: Fcfa }[] {
  const out: { index: number; membershipId: string; amount: Fcfa }[] = [];
  plan.forEach((c, index) => {
    const debt = c.postings
      .filter((p) => p.account === receivableAccount(c.membershipId) && p.amount > 0)
      .reduce((s, p) => s + p.amount, 0);
    if (debt > 0) out.push({ index, membershipId: c.membershipId, amount: debt });
  });
  return out;
}

/** Money the given postings credit to an account (read naturally, liabilities only). */
export const creditsTo = (postings: readonly Posting[], account: string): Fcfa =>
  postings.filter((p) => p.account === account && p.amount < 0).reduce((s, p) => s - p.amount, 0);

/** D10: the winner of each pot assigned in the ledger (an assignment reversed is forgotten). */
export function potWinners(ledger: readonly LedgerTransaction[]): Record<string, string> {
  const winners: Record<string, string> = {};
  const bySeq = new Map(ledger.map((t) => [t.seq, t]));
  for (const tx of ledger) {
    const target =
      tx.type === 'REVERSAL' ? bySeq.get(tx.metadata.reversesSeq as number) : undefined;
    const assignment =
      tx.type === 'POT_ASSIGNED' ? tx : target?.type === 'POT_ASSIGNED' ? target : null;
    if (!assignment) continue;
    const pot = assignment.postings
      .map((p) => parseAccount(p.account))
      .find((a) => a?.kind === 'POT');
    const winner = assignment.postings
      .map((p) => parseAccount(p.account))
      .find((a) => a?.kind === 'PAYABLE');
    if (!pot || !winner) continue;
    if (tx === assignment) winners[pot.id!] = winner.id!;
    else delete winners[pot.id!];
  }
  return winners;
}

/**
 * D15, D16.1, D18: the corrections a REVERSAL of `original` needs so no payable, pot or solidarity
 * fund goes below zero: a POT_CORRECTION for each assigned pot it credited, a CLAWBACK for each
 * member payable it credited by what that payable no longer holds, then CLAWBACKs for what the
 * solidarity fund no longer holds (D18.3 order, capped at each payout). `ledger` is the group's whole
 * ledger before the corrections; everything is computed from it.
 */
export function planReversalCorrections(input: {
  original: Pick<LedgerTransaction, 'seq' | 'type' | 'membershipId' | 'postings'>;
  ledger: readonly LedgerTransaction[];
}): PlannedCorrection[] {
  if (DISBURSEMENT_TYPES.includes(input.original.type))
    throw new RangeError(
      `a ${input.original.type} is never reversed: record DISBURSEMENT_RETURNED or DISBURSEMENT_REFUNDED (L4)`,
    );
  let balances = computeBalances(input.ledger);
  const history = createSolidarityHistory();
  for (const tx of input.ledger) history.observe(tx);
  const winners = potWinners(input.ledger);
  const out: PlannedCorrection[] = [];
  const held = (account: string) =>
    Math.max(0, naturalBalance(account, balances.get(account) ?? 0));
  const add = (c: PlannedCorrection) => {
    out.push(c);
    balances = applyPostings(balances, c.postings);
  };
  const base = { forReversalOfSeq: input.original.seq };
  const accounts = [...new Set(input.original.postings.map((p) => p.account))].sort();
  for (const account of accounts) {
    const parsed = parseAccount(account);
    const winner = parsed?.kind === 'POT' ? winners[parsed.id!] : undefined;
    const amount = creditsTo(input.original.postings, account);
    if (!winner || amount === 0) continue;
    const postings = potCorrectionPostings({
      roundId: parsed!.id!,
      beneficiaryMembershipId: winner,
      amount,
      winnerPayable: held(payableAccount(winner)),
    });
    add({ type: 'POT_CORRECTION', membershipId: winner, postings, metadata: base });
  }
  for (const account of accounts) {
    const parsed = parseAccount(account);
    if (parsed?.kind !== 'PAYABLE') continue;
    const debt = Math.max(0, creditsTo(input.original.postings, account) - held(account));
    if (debt === 0) continue;
    const postings = clawbackPostings({
      debtorMembershipId: parsed.id!,
      from: 'PAYABLE',
      amount: debt,
    });
    add({ type: 'CLAWBACK', membershipId: parsed.id!, postings, metadata: base });
  }
  const shortfall = Math.max(
    0,
    creditsTo(input.original.postings, SOLIDARITY_FUND) - held(SOLIDARITY_FUND),
  );
  if (shortfall === 0) return out;
  const payer = input.original.type === 'PAYMENT_RECEIVED' ? input.original.membershipId : null;
  for (const debt of history.allocate(shortfall, payer)) {
    const payable = payableAccount(debt.debtorMembershipId);
    // The reversal will still take back what it credited to this payable: only the rest can pay.
    const free = Math.max(0, held(payable) - creditsTo(input.original.postings, payable));
    const postings = clawbackPostings({
      debtorMembershipId: debt.debtorMembershipId,
      from: 'SOLIDARITY_FUND',
      amount: debt.amount,
      fromPayable: Math.min(debt.amount, free),
    });
    add({
      type: 'CLAWBACK',
      membershipId: debt.debtorMembershipId,
      postings,
      metadata: { ...base, solidarityPayoutSeq: debt.payoutSeq },
    });
  }
  return out;
}
