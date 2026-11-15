// Disbursements in flight (D18.1, 2.5, R4.3, R4.4). Money leaving the group goes in two steps:
// DISBURSEMENT_SENT moves the amount plus the estimated fee from its source (the member's payable for
// a withdrawal, the solidarity fund for a solidarity payout, the general fund for a loan) to the
// operation's in-flight account; the provider's answer then completes it from there
// (WITHDRAWAL_COMPLETED, LOAN_DISBURSED, SOLIDARITY_DISBURSED: cash out, actual fee reconciled) or
// returns it (DISBURSEMENT_RETURNED, the exact negation of the send).

import type { FeeSource } from '../fees';
import { assertNonNegativeFcfa, type Fcfa } from '../money';
import {
  CASH_PROVIDER,
  GENERAL_FUND,
  inFlightAccount,
  payableAccount,
  receivableAccount,
  SOLIDARITY_FUND,
} from './accounts';
import { positive, post } from './lines';
import type { Posting, TransactionType } from './types';

/** What a disbursement pays out (R5.4, R7.5, R10.3). */
export type DisbursementPurpose = 'WITHDRAWAL' | 'LOAN' | 'SOLIDARITY';

/**
 * D18.1: DISBURSEMENT_SENT metadata. `amount` is what reaches the recipient's phone (W, the
 * principal P, or the solidarity payout A minus its estimated fee); `amount + feeEstimated` is in
 * flight. `interest` is the loan interest booked at send (0 for the other purposes).
 */
export type DisbursementSentMetadata = {
  purpose: DisbursementPurpose;
  amount: Fcfa;
  feeEstimated: Fcfa;
  interest: Fcfa;
};

/** R4.3, R4.4: metadata of a completion (WITHDRAWAL_COMPLETED, LOAN_DISBURSED, SOLIDARITY_DISBURSED). */
export type DisbursementFeeMetadata = { feeEstimated: Fcfa; feeActual: Fcfa; feeSource: FeeSource };

type Sent = { postings: Posting[]; metadata: DisbursementSentMetadata };

/** D18.1: the completion type of each purpose. */
export function completionType(purpose: DisbursementPurpose): TransactionType {
  return purpose === 'WITHDRAWAL'
    ? 'WITHDRAWAL_COMPLETED'
    : purpose === 'LOAN'
      ? 'LOAN_DISBURSED'
      : 'SOLIDARITY_DISBURSED';
}

/** D18.1, R5.4: payable +(W + feeEst), in-flight −(W + feeEst). */
export function withdrawalSentPostings(input: {
  operationId: string;
  membershipId: string;
  amount: Fcfa;
  feeEstimated: Fcfa;
}): Sent {
  const w = positive(input.amount, 'withdrawal');
  assertNonNegativeFcfa(input.feeEstimated, 'feeEstimated');
  const out = w + input.feeEstimated;
  return {
    postings: [
      { account: payableAccount(input.membershipId), amount: out },
      { account: inFlightAccount(input.operationId), amount: -out },
    ],
    metadata: { purpose: 'WITHDRAWAL', amount: w, feeEstimated: input.feeEstimated, interest: 0 },
  };
}

/**
 * D18.1, R7.3, R7.5: the loan is booked when sent: receivable +(P + I + feeEst), general fund −I,
 * in-flight −(P + feeEst). With the completion at the estimated fee this is exactly spec 2.5 (E3).
 */
export function loanSentPostings(input: {
  operationId: string;
  membershipId: string;
  principal: Fcfa;
  interest: Fcfa;
  feeEstimated: Fcfa;
}): Sent {
  const p = positive(input.principal, 'principal');
  assertNonNegativeFcfa(input.interest, 'interest');
  assertNonNegativeFcfa(input.feeEstimated, 'feeEstimated');
  const postings: Posting[] = [];
  post(postings, receivableAccount(input.membershipId), p + input.interest + input.feeEstimated);
  post(postings, GENERAL_FUND, -input.interest);
  post(postings, inFlightAccount(input.operationId), -(p + input.feeEstimated));
  return {
    postings,
    metadata: {
      purpose: 'LOAN',
      amount: p,
      feeEstimated: input.feeEstimated,
      interest: input.interest,
    },
  };
}

/** D18.1, R10.3: solidarity fund +A, in-flight −A. The recipient receives A − feeEst. */
export function solidaritySentPostings(input: {
  operationId: string;
  /** A: the payout the vote passed. */
  amount: Fcfa;
  feeEstimated: Fcfa;
}): Sent {
  const a = positive(input.amount, 'solidarity payout');
  assertNonNegativeFcfa(input.feeEstimated, 'feeEstimated');
  if (input.feeEstimated >= a) throw new RangeError('the payout must be above its estimated fee');
  return {
    postings: [
      { account: SOLIDARITY_FUND, amount: a },
      { account: inFlightAccount(input.operationId), amount: -a },
    ],
    metadata: {
      purpose: 'SOLIDARITY',
      amount: a - input.feeEstimated,
      feeEstimated: input.feeEstimated,
      interest: 0,
    },
  };
}

/**
 * D18.1, R4.3: the provider confirmed: in-flight +(amount + feeEst), general fund +(feeAct − feeEst)
 * (omitted when zero), cash −(amount + feeAct). `amount` is what reached the recipient.
 */
export function disbursementCompletedPostings(
  input: { operationId: string; amount: Fcfa } & DisbursementFeeMetadata,
): { postings: Posting[]; metadata: DisbursementFeeMetadata } {
  const amount = positive(input.amount, 'disbursement');
  assertNonNegativeFcfa(input.feeEstimated, 'feeEstimated');
  assertNonNegativeFcfa(input.feeActual, 'feeActual');
  const postings: Posting[] = [];
  post(postings, inFlightAccount(input.operationId), amount + input.feeEstimated);
  post(postings, GENERAL_FUND, input.feeActual - input.feeEstimated);
  post(postings, CASH_PROVIDER, -(amount + input.feeActual));
  return {
    postings,
    metadata: {
      feeEstimated: input.feeEstimated,
      feeActual: input.feeActual,
      feeSource: input.feeSource,
    },
  };
}

/** D18.1: the provider failed: the exact negation of the send gives the money back to its source. */
export function disbursementReturnedPostings(sent: readonly Posting[]): Posting[] {
  if (sent.length === 0) throw new RangeError('only a sent disbursement can be returned');
  return sent.map((p) => ({ account: p.account, amount: 0 - p.amount }));
}

/**
 * D22.1: DISBURSEMENT_REFUNDED metadata: the completion it undoes and the fee the operator kept.
 * Owner Q2: a loan refund also records `paidBack`, the installments already repaid (0 when none).
 */
export type DisbursementRefundedMetadata = { completedSeq: number; feeKept: Fcfa; paidBack?: Fcfa };

type Recorded = { postings: readonly Posting[]; metadata: Readonly<Record<string, unknown>> };

/**
 * D22.1: the operator reversed a COMPLETED disbursement and sent the money back. The send's sources
 * are refilled exactly (payable +(W + feeEst), solidarity fund +A, or loan receivable −(P + I +
 * feeEst) with the interest back off the general fund); cash comes back as what the completion paid
 * out (amount + feeActual) minus `feeKept`, the fee the operator keeps (0 to feeActual); the general
 * fund takes the difference (feeEst − feeActual + feeKept): with nothing kept, completion and refund
 * cancel out exactly; whatever the operator keeps is borne by the general fund.
 * Owner Q2: for a loan, `paidBack` (the installments already repaid, 0 to P + I + feeEst) is credited
 * back to the borrower's payable and the receivable is reduced only by P + I + feeEst − paidBack (the
 * unpaid installments, which the service cancels).
 */
export function disbursementRefundedPostings(input: {
  /** The DISBURSEMENT_SENT and the completion, as stored. */
  sent: Recorded;
  completed: Recorded;
  completedSeq: number;
  feeKept: Fcfa;
  /** Owner Q2, loans only: installments already repaid (default 0). */
  paidBack?: Fcfa;
}): { postings: Posting[]; metadata: DisbursementRefundedMetadata } {
  const isInFlight = (p: Posting) => p.account.startsWith('inflight:disbursement:');
  const sources = input.sent.postings.filter((p) => !isInFlight(p));
  const inFlight = input.sent.postings.find(isInFlight);
  const cashOut = input.completed.postings.find((p) => p.account === CASH_PROVIDER);
  if (!inFlight || sources.length === 0 || !cashOut || cashOut.amount >= 0)
    throw new RangeError('only a sent and completed disbursement can be refunded');
  const feeEstimated = input.sent.metadata.feeEstimated;
  const feeActual = input.completed.metadata.feeActual;
  assertNonNegativeFcfa(feeEstimated as number, 'feeEstimated');
  assertNonNegativeFcfa(feeActual as number, 'feeActual');
  assertNonNegativeFcfa(input.feeKept, 'feeKept');
  if (input.feeKept > (feeActual as number))
    throw new RangeError('the operator cannot keep more than the fee it charged');
  if (!Number.isSafeInteger(input.completedSeq) || input.completedSeq < 1)
    throw new RangeError('completedSeq must be a seq');
  const lines = new Map<string, number>();
  const add = (account: string, amount: number) =>
    lines.set(account, (lines.get(account) ?? 0) + amount);
  for (const p of sources) add(p.account, 0 - p.amount);
  const cashBack = 0 - cashOut.amount - input.feeKept;
  add(CASH_PROVIDER, cashBack);
  // The sources refilled hold amount + feeEst; cash brings back amount + feeAct − feeKept.
  add(GENERAL_FUND, 0 - inFlight.amount - cashBack);
  const isLoan = input.sent.metadata.purpose === 'LOAN';
  const paidBack = input.paidBack ?? 0;
  assertNonNegativeFcfa(paidBack, 'paidBack');
  if (!isLoan && paidBack > 0) throw new RangeError('only a loan refund credits installments back');
  if (isLoan) {
    const receivable = sources.find((p) => p.account.startsWith('receivable:member:'))!;
    if (paidBack > receivable.amount)
      throw new RangeError('paidBack cannot be above the loan total (P + I + fee)');
    add(receivable.account, paidBack);
    add(payableAccount(receivable.account.slice('receivable:member:'.length)), -paidBack);
  }
  const postings: Posting[] = [];
  for (const [account, amount] of [...lines].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    post(postings, account, amount);
  const metadata: DisbursementRefundedMetadata = {
    completedSeq: input.completedSeq,
    feeKept: input.feeKept,
  };
  if (isLoan) metadata.paidBack = paidBack;
  return { postings, metadata };
}
