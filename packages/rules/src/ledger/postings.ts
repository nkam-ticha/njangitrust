// Posting builders, one per transaction type, exactly as the table in spec 2.5. Zero postings
// (such as a fee adjustment when the actual fee equals the estimate) are omitted.

import { splitCollectionFee, type PaymentPart, type PaymentPartWithFee } from '../fees';
import { assertNonNegativeFcfa, type Fcfa } from '../money';
import {
  CASH_PROVIDER,
  GENERAL_FUND,
  payableAccount,
  potAccount,
  receivableAccount,
  SOLIDARITY_FUND,
} from './accounts';
import type { Posting } from './types';

function positive(amount: number, label: string): Fcfa {
  assertNonNegativeFcfa(amount, label);
  if (amount === 0) throw new RangeError(`${label} must be above zero`);
  return amount;
}

function post(out: Posting[], account: string, amount: number): void {
  if (amount !== 0) out.push({ account, amount });
}

/** 2.5 invariant 1: true when the postings sum to zero. */
export function sumsToZero(postings: readonly Posting[]): boolean {
  let total = 0n;
  for (const p of postings) total += BigInt(p.amount);
  return total === 0n;
}

/**
 * 2.5 PAYMENT_RECEIVED, R4.2: cash +(total − fee); each part net of its fee share goes to the
 * beneficiary's payable (or the round pot), the leaver's payable, or the solidarity fund; a debt part
 * clears the payer's receivable in full and the general fund bears its fee share.
 */
export function paymentReceivedPostings(input: {
  payerMembershipId: string;
  fee: Fcfa;
  parts: readonly PaymentPart[];
}): { postings: Posting[]; parts: PaymentPartWithFee[] } {
  const parts = splitCollectionFee(input.parts, input.fee);
  const total = parts.reduce((sum, p) => sum + p.amount, 0);
  const postings: Posting[] = [];
  post(postings, CASH_PROVIDER, total - input.fee);
  for (const part of parts) {
    const net = part.amount - part.feeShare;
    switch (part.kind) {
      case 'CONTRIBUTION':
        post(
          postings,
          part.potRoundId
            ? potAccount(part.potRoundId)
            : payableAccount(part.creditorMembershipId!),
          -net,
        );
        break;
      case 'SHORTFALL':
        post(postings, payableAccount(part.creditorMembershipId!), -net);
        break;
      case 'SOLIDARITY':
        post(postings, SOLIDARITY_FUND, -net);
        break;
      case 'DEBT':
        post(postings, receivableAccount(input.payerMembershipId), -part.amount);
        post(postings, GENERAL_FUND, part.feeShare);
        break;
    }
  }
  return { postings, parts };
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

/** 2.5 WITHDRAWAL_COMPLETED (R5.4, R4.3): payable +(W + feeEst), fund +(feeAct − feeEst), cash −(W + feeAct). */
export function withdrawalCompletedPostings(input: {
  membershipId: string;
  amount: Fcfa;
  feeEstimated: Fcfa;
  feeActual: Fcfa;
}): Posting[] {
  const w = positive(input.amount, 'withdrawal');
  assertNonNegativeFcfa(input.feeEstimated, 'feeEstimated');
  assertNonNegativeFcfa(input.feeActual, 'feeActual');
  const postings: Posting[] = [];
  post(postings, payableAccount(input.membershipId), w + input.feeEstimated);
  post(postings, GENERAL_FUND, input.feeActual - input.feeEstimated);
  post(postings, CASH_PROVIDER, -(w + input.feeActual));
  return postings;
}

/**
 * 2.5 LOAN_DISBURSED (R7.3, R7.5): receivable +(P + I + feeEst), fund −I, fund +(feeAct − feeEst),
 * cash −(P + feeAct). The borrower receives P.
 */
export function loanDisbursedPostings(input: {
  membershipId: string;
  principal: Fcfa;
  interest: Fcfa;
  feeEstimated: Fcfa;
  feeActual: Fcfa;
}): Posting[] {
  const p = positive(input.principal, 'principal');
  assertNonNegativeFcfa(input.interest, 'interest');
  assertNonNegativeFcfa(input.feeEstimated, 'feeEstimated');
  assertNonNegativeFcfa(input.feeActual, 'feeActual');
  const postings: Posting[] = [];
  post(postings, receivableAccount(input.membershipId), p + input.interest + input.feeEstimated);
  post(postings, GENERAL_FUND, -input.interest);
  post(postings, GENERAL_FUND, input.feeActual - input.feeEstimated);
  post(postings, CASH_PROVIDER, -(p + input.feeActual));
  return postings;
}

/**
 * 2.5 SOLIDARITY_DISBURSED (R10.3): solidarity fund +A, fund +(feeAct − feeEst),
 * cash −(A − feeEst + feeAct). The recipient receives A − feeEst.
 */
export function solidarityDisbursedPostings(input: {
  amount: Fcfa;
  feeEstimated: Fcfa;
  feeActual: Fcfa;
}): Posting[] {
  const a = positive(input.amount, 'solidarity payout');
  assertNonNegativeFcfa(input.feeEstimated, 'feeEstimated');
  assertNonNegativeFcfa(input.feeActual, 'feeActual');
  if (input.feeEstimated >= a) throw new RangeError('the payout must be above its estimated fee');
  const postings: Posting[] = [];
  post(postings, SOLIDARITY_FUND, a);
  post(postings, GENERAL_FUND, input.feeActual - input.feeEstimated);
  post(postings, CASH_PROVIDER, -(a - input.feeEstimated + input.feeActual));
  return postings;
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

/** 2.5 REVERSAL: the exact negation of an earlier transaction's postings. */
export function reversalPostings(original: readonly Posting[]): Posting[] {
  if (original.length === 0)
    throw new RangeError('only a transaction with postings can be reversed');
  return original.map((p) => ({ account: p.account, amount: 0 - p.amount }));
}
