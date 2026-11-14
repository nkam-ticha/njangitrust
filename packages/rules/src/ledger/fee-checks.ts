// Fee metadata checks (R4.2, R4.3, R4.4): every fee-bearing entry records its fees, and its
// postings must be exactly what those fees give. Lets anyone recompute the R4.2 split.

import { collectionFeeShares, type PaymentPartKind } from '../fees';
import { parseAccount, type AccountKind } from './accounts';
import {
  disbursementCompletedPostings,
  loanSentPostings,
  solidaritySentPostings,
  withdrawalSentPostings,
} from './disbursement-postings';
import type { PaymentPartRecord } from './fee-postings';
import { sortPostings } from './hash-chain';
import { post } from './lines';
import type { LedgerEntry, Posting } from './types';
import type { LedgerProblemCode } from './validation';

const FEE_SOURCES = ['PROVIDER', 'SCHEDULE'];
const PART_ACCOUNTS: Record<PaymentPartKind, AccountKind[]> = {
  CONTRIBUTION: ['PAYABLE', 'POT'],
  SHORTFALL: ['PAYABLE'],
  SOLIDARITY: ['SOLIDARITY_FUND'],
  DEBT: ['RECEIVABLE'],
};

const whole = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

function same(a: readonly Posting[], b: readonly Posting[]): boolean {
  const x = sortPostings(a);
  const y = sortPostings(b);
  return (
    x.length === y.length &&
    x.every((p, i) => p.account === y[i]!.account && p.amount === y[i]!.amount)
  );
}

function paymentIssue(entry: LedgerEntry): string | null {
  const m = entry.metadata as Record<string, unknown>;
  if (!whole(m.fee) || !FEE_SOURCES.includes(m.feeSource as string))
    return 'fee and feeSource are required';
  if (!Array.isArray(m.parts) || m.parts.length === 0) return 'the payment parts are required';
  const parts = m.parts as PaymentPartRecord[];
  for (const p of parts) {
    const kind = parseAccount(String(p?.account))?.kind;
    if (
      !p ||
      !PART_ACCOUNTS[p.kind] ||
      !whole(p.amount) ||
      p.amount === 0 ||
      !whole(p.feeShare) ||
      !whole(p.tieOrder)
    ) {
      return 'a payment part is malformed';
    }
    if (!kind || !PART_ACCOUNTS[p.kind].includes(kind))
      return `a ${p.kind} part cannot credit ${p.account}`;
    if (p.feeCharged !== undefined) {
      // D22.2: only a debt part, above zero (else omitted) and below the part.
      if (
        p.kind !== 'DEBT' ||
        !whole(p.feeCharged) ||
        p.feeCharged === 0 ||
        p.feeCharged >= p.amount
      )
        return 'feeCharged is only on a debt part, above zero and below the part';
    }
  }
  const total = parts.reduce((s, p) => s + p.amount, 0);
  if (m.fee > total) return 'the fee is above the payment';
  const shares = collectionFeeShares(parts, m.fee);
  if (shares.some((s, i) => s !== parts[i]!.feeShare))
    return 'the recorded fee split does not follow R4.2';
  const expected: Posting[] = [];
  post(expected, 'cash:provider', total - m.fee);
  for (const p of parts) {
    if (p.kind === 'DEBT') {
      const charged = p.feeCharged ?? 0;
      post(expected, p.account, -(p.amount - charged));
      post(expected, 'fund:general', p.feeShare - charged);
    } else {
      post(expected, p.account, -(p.amount - p.feeShare));
    }
  }
  return same(expected, entry.postings)
    ? null
    : 'the postings do not follow the recorded parts and fee';
}

function amountOn(
  entry: LedgerEntry,
  kind: AccountKind,
): { account: string; amount: number } | undefined {
  return entry.postings.find((p) => parseAccount(p.account)?.kind === kind);
}

const PURPOSES = ['WITHDRAWAL', 'LOAN', 'SOLIDARITY'];

/** D18.1: a send's postings rebuilt from its metadata, its member and its in-flight account. */
function sentIssue(entry: LedgerEntry): string | null {
  const m = entry.metadata as Record<string, unknown>;
  if (!PURPOSES.includes(m.purpose as string)) return 'metadata.purpose is required';
  if (!whole(m.amount) || !whole(m.feeEstimated) || !whole(m.interest))
    return 'amount, feeEstimated and interest are required';
  if (m.purpose !== 'LOAN' && m.interest !== 0) return 'only a loan carries interest';
  const inFlight = amountOn(entry, 'IN_FLIGHT');
  if (!inFlight) return 'no in-flight posting';
  const operationId = parseAccount(inFlight.account)!.id!;
  const membershipId = entry.membershipId ?? '';
  const fee = m.feeEstimated;
  const expected =
    m.purpose === 'WITHDRAWAL'
      ? withdrawalSentPostings({ operationId, membershipId, amount: m.amount, feeEstimated: fee })
      : m.purpose === 'LOAN'
        ? loanSentPostings({
            operationId,
            membershipId,
            principal: m.amount,
            interest: m.interest,
            feeEstimated: fee,
          })
        : solidaritySentPostings({ operationId, amount: m.amount + fee, feeEstimated: fee });
  return same(expected.postings, entry.postings)
    ? null
    : 'the postings do not follow the recorded purpose, amount and fee';
}

/** R4.3, D18.1: a completion's postings rebuilt from its in-flight line and its fees. */
function completionIssue(entry: LedgerEntry): string | null {
  const m = entry.metadata as Record<string, unknown>;
  if (
    !whole(m.feeEstimated) ||
    !whole(m.feeActual) ||
    !FEE_SOURCES.includes(m.feeSource as string)
  ) {
    return 'feeEstimated, feeActual and feeSource are required';
  }
  const inFlight = amountOn(entry, 'IN_FLIGHT');
  if (!inFlight) return 'no in-flight posting';
  const expected = disbursementCompletedPostings({
    operationId: parseAccount(inFlight.account)!.id!,
    amount: inFlight.amount - m.feeEstimated,
    feeEstimated: m.feeEstimated,
    feeActual: m.feeActual,
    feeSource: m.feeSource as 'PROVIDER',
  }).postings;
  return same(expected, entry.postings) ? null : 'the postings do not follow the recorded fees';
}

const COMPLETIONS = ['WITHDRAWAL_COMPLETED', 'LOAN_DISBURSED', 'SOLIDARITY_DISBURSED'];

/** R4.2–R4.4, D18.1: problems with the fee metadata of a payment or disbursement; empty otherwise. */
export function feeProblems(entry: LedgerEntry): { code: LedgerProblemCode; detail: string }[] {
  let issue: string | null = null;
  try {
    if (entry.type === 'PAYMENT_RECEIVED') issue = paymentIssue(entry);
    else if (entry.type === 'DISBURSEMENT_SENT') issue = sentIssue(entry);
    else if (COMPLETIONS.includes(entry.type)) issue = completionIssue(entry);
  } catch (error) {
    issue = (error as Error).message;
  }
  return issue ? [{ code: 'FEE_MISMATCH', detail: issue }] : [];
}
