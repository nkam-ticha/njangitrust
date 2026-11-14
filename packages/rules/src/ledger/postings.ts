// Posting builders for the transaction types without fees, exactly as the table in spec 2.5.
// Fee-bearing types (payments and disbursements) are in fee-postings.ts.

import { assertNonNegativeFcfa, type Fcfa } from '../money';
import { GENERAL_FUND, payableAccount, potAccount, receivableAccount } from './accounts';
import { positive, post } from './lines';
import type { Posting } from './types';

/** 2.5 invariant 1: true when the postings sum to zero. */
export function sumsToZero(postings: readonly Posting[]): boolean {
  let total = 0n;
  for (const p of postings) total += BigInt(p.amount);
  return total === 0n;
}

/** 2.5 FINE_ASSESSED (R6): receivable +A, general fund −A. */
export function fineAssessedPostings(input: { membershipId: string; amount: Fcfa }): Posting[] {
  const a = positive(input.amount, 'fine');
  return [
    { account: receivableAccount(input.membershipId), amount: a },
    { account: GENERAL_FUND, amount: -a },
  ];
}

/** 2.5 BID_ASSESSED (R8.5): the winner's receivable +A, general fund −A. */
export function bidAssessedPostings(input: { membershipId: string; amount: Fcfa }): Posting[] {
  const a = positive(input.amount, 'bid');
  return [
    { account: receivableAccount(input.membershipId), amount: a },
    { account: GENERAL_FUND, amount: -a },
  ];
}

/** 2.5 AUTO_SETTLEMENT (R5.3): payable +X, receivable −X, same member. */
export function autoSettlementPostings(input: { membershipId: string; amount: Fcfa }): Posting[] {
  const x = positive(input.amount, 'settlement');
  return [
    { account: payableAccount(input.membershipId), amount: x },
    { account: receivableAccount(input.membershipId), amount: -x },
  ];
}

/** 2.5 LEAVER_REFUND (R12.3): the leaver's payable −F, general fund +F. */
export function leaverRefundPostings(input: { membershipId: string; amount: Fcfa }): Posting[] {
  const f = positive(input.amount, 'refund');
  return [
    { account: payableAccount(input.membershipId), amount: -f },
    { account: GENERAL_FUND, amount: f },
  ];
}

/** 2.5 FUND_DISTRIBUTION (R9.3): general fund +X, each eligible member's payable −share. */
export function fundDistributionPostings(input: {
  shares: readonly { membershipId: string; amount: Fcfa }[];
}): Posting[] {
  if (input.shares.length === 0) throw new RangeError('a distribution needs at least one share');
  const lines = input.shares.map((s) => ({
    account: payableAccount(s.membershipId),
    amount: -positive(s.amount, 'share'),
  }));
  const total = lines.reduce((sum, l) => sum - l.amount, 0);
  return [{ account: GENERAL_FUND, amount: total }, ...lines];
}

/** POT_ASSIGNED (R8.3, R3.4): a bidding round's pot moves to its beneficiary's payable. */
export function potAssignedPostings(input: {
  roundId: string;
  beneficiaryMembershipId: string;
  amount: Fcfa;
}): Posting[] {
  const x = positive(input.amount, 'pot');
  return [
    { account: potAccount(input.roundId), amount: x },
    { account: payableAccount(input.beneficiaryMembershipId), amount: -x },
  ];
}

/**
 * D15, D18.1: the part of a reversed pot payment the winner's payable no longer holds (its ledger
 * balance: withdrawals in flight have already left it). It becomes the winner's debt to the group
 * (receivable), settled like a fine; the general fund never absorbs it.
 */
export function potCorrectionDebt(input: { amount: Fcfa; winnerPayable: Fcfa }): Fcfa {
  positive(input.amount, 'correction');
  assertNonNegativeFcfa(input.winnerPayable, 'winnerPayable');
  return Math.max(0, input.amount - input.winnerPayable);
}

/**
 * POT_CORRECTION (D10, D15): moves a reversed pot payment's net amount back into the round pot so
 * the payment can be reversed exactly after POT_ASSIGNED: from the winner's payable as far as it
 * goes, the rest as the winner's receivable (potCorrectionDebt).
 */
export function potCorrectionPostings(input: {
  roundId: string;
  beneficiaryMembershipId: string;
  amount: Fcfa;
  winnerPayable: Fcfa;
}): Posting[] {
  const debt = potCorrectionDebt(input);
  const postings: Posting[] = [];
  post(postings, payableAccount(input.beneficiaryMembershipId), input.amount - debt);
  post(postings, receivableAccount(input.beneficiaryMembershipId), debt);
  post(postings, potAccount(input.roundId), -input.amount);
  return postings;
}

/** 2.5 REVERSAL: the exact negation of an earlier transaction's postings. */
export function reversalPostings(original: readonly Posting[]): Posting[] {
  if (original.length === 0)
    throw new RangeError('only a transaction with postings can be reversed');
  return original.map((p) => ({ account: p.account, amount: 0 - p.amount }));
}
