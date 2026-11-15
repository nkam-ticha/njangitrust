// Shape checks of a ledger entry (2.5): known type and accounts, whole non-zero amounts that sum to
// zero, ISO 8601 UTC time, canonical metadata, and only the accounts each transaction type uses.

import { canonicalJSON } from '../crypto';
import { parseAccount, type AccountKind } from './accounts';
import { feeProblems } from './fee-checks';
import { sumsToZero } from './postings';
import { shapeProblems } from './shapes';
import { TRANSACTION_TYPES, type LedgerEntry, type TransactionType } from './types';

/** Problem codes reported by the ledger checks (hash chain, entries, balances, export). */
export type LedgerProblemCode =
  | 'SEQ_GAP'
  | 'GROUP_MISMATCH'
  | 'PREV_HASH_MISMATCH'
  | 'HASH_MISMATCH'
  | 'MALFORMED_TRANSACTION'
  | 'SHAPE_MISMATCH'
  | 'FEE_MISMATCH'
  | 'POT_MISMATCH'
  | 'CORRECTION_MISMATCH'
  | 'IN_FLIGHT_MISMATCH'
  | 'BID_MISMATCH'
  | 'RESERVED_LENT'
  | 'UNHASHED_FIELD'
  | 'NOT_BALANCED'
  | 'ACCOUNT_NOT_ALLOWED'
  | 'REVERSAL_MISMATCH'
  | 'DUPLICATE_ID'
  | 'NEGATIVE_BALANCE'
  | 'HEAD_MISMATCH'
  | 'BALANCE_MISMATCH'
  | 'DRAW_MISMATCH'
  | 'PROPOSAL_INCONSISTENT'
  | 'UNMASKED_PHONE_NUMBER'
  | 'MALFORMED_EXPORT';

/**
 * H1: what is reported about the ledger's current state without being an integrity problem. Today
 * only RESERVED_NOT_COVERED (D16.2): cash below what is reserved. The daily check is ALERT while it
 * lasts (reconcile with reservedShortfall), but a ledger that went uncovered and was repaid is sound.
 */
export type LedgerWarningCode = 'RESERVED_NOT_COVERED';

export interface LedgerWarning {
  code: LedgerWarningCode;
  detail: string;
}

/** A problem found in a ledger, at the exact `seq` when it belongs to a transaction. */
export interface LedgerProblem {
  seq: number | null;
  code: LedgerProblemCode;
  detail: string;
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** D6: true for an ISO 8601 UTC timestamp as produced by Date.prototype.toISOString. */
export function isIsoUtc(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_UTC.test(value)) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value;
}

/** 2.5: account kinds each transaction type may post to (REVERSAL may mirror any type). */
export const ALLOWED_ACCOUNT_KINDS: Readonly<
  Record<TransactionType, readonly AccountKind[] | 'ANY'>
> = {
  PAYMENT_RECEIVED: ['CASH', 'PAYABLE', 'POT', 'SOLIDARITY_FUND', 'RECEIVABLE', 'GENERAL_FUND'],
  FINE_ASSESSED: ['RECEIVABLE', 'GENERAL_FUND'],
  BID_ASSESSED: ['RECEIVABLE', 'GENERAL_FUND'],
  AUTO_SETTLEMENT: ['PAYABLE', 'RECEIVABLE'],
  DISBURSEMENT_SENT: ['PAYABLE', 'RECEIVABLE', 'GENERAL_FUND', 'SOLIDARITY_FUND', 'IN_FLIGHT'],
  WITHDRAWAL_COMPLETED: ['IN_FLIGHT', 'GENERAL_FUND', 'CASH'],
  LOAN_DISBURSED: ['IN_FLIGHT', 'GENERAL_FUND', 'CASH'],
  SOLIDARITY_DISBURSED: ['IN_FLIGHT', 'GENERAL_FUND', 'CASH'],
  DISBURSEMENT_RETURNED: ['PAYABLE', 'RECEIVABLE', 'GENERAL_FUND', 'SOLIDARITY_FUND', 'IN_FLIGHT'],
  DISBURSEMENT_REFUNDED: ['PAYABLE', 'RECEIVABLE', 'GENERAL_FUND', 'SOLIDARITY_FUND', 'CASH'],
  LEAVER_REFUND: ['PAYABLE', 'GENERAL_FUND'],
  FUND_DISTRIBUTION: ['GENERAL_FUND', 'PAYABLE'],
  POT_ASSIGNED: ['POT', 'PAYABLE'],
  POT_CORRECTION: ['PAYABLE', 'RECEIVABLE', 'POT'],
  CLAWBACK: ['RECEIVABLE', 'PAYABLE', 'SOLIDARITY_FUND'],
  CLAWBACK_RELEASE: ['SOLIDARITY_FUND', 'RECEIVABLE', 'PAYABLE'],
  REVERSAL: 'ANY',
  EVENT: [],
};

const isNullableString = (v: unknown) => v === null || typeof v === 'string';
const isSeq = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 1;

/** 2.5 invariant 1 and the posting table: every problem of one entry, empty when it is valid. */
export function entryProblems(entry: LedgerEntry): { code: LedgerProblemCode; detail: string }[] {
  const problems: { code: LedgerProblemCode; detail: string }[] = [];
  const malformed = (detail: string) => problems.push({ code: 'MALFORMED_TRANSACTION', detail });
  if (typeof entry.id !== 'string' || entry.id.length === 0)
    malformed('id must be a non-empty string');
  if (!TRANSACTION_TYPES.includes(entry.type)) malformed(`unknown type ${String(entry.type)}`);
  if (!isIsoUtc(entry.occurredAt)) malformed('occurredAt must be an ISO 8601 UTC timestamp');
  for (const key of ['roundId', 'membershipId', 'refType', 'refId'] as const) {
    if (!isNullableString(entry[key])) malformed(`${key} must be a string or null`);
  }
  if (typeof entry.descriptionFr !== 'string' || typeof entry.descriptionEn !== 'string') {
    malformed('descriptions must be strings');
  }
  if (!entry.metadata || typeof entry.metadata !== 'object' || Array.isArray(entry.metadata)) {
    malformed('metadata must be an object');
  } else {
    try {
      canonicalJSON(entry.metadata);
    } catch (error) {
      malformed(`metadata: ${(error as Error).message}`);
    }
  }
  if (!Array.isArray(entry.postings)) {
    malformed('postings must be a list');
    return problems;
  }
  const allowed = ALLOWED_ACCOUNT_KINDS[entry.type] ?? [];
  if (entry.type === 'EVENT' && entry.postings.length > 0) malformed('an EVENT has no postings');
  if (entry.type !== 'EVENT' && entry.postings.length < 2)
    malformed('money entries need two postings');
  let wholeAmounts = true;
  for (const p of entry.postings) {
    const parsed = typeof p?.account === 'string' ? parseAccount(p.account) : null;
    if (!parsed) malformed(`unknown account ${String(p?.account)}`);
    else if (allowed !== 'ANY' && !allowed.includes(parsed.kind)) {
      problems.push({
        code: 'ACCOUNT_NOT_ALLOWED',
        detail: `${entry.type} cannot post to ${p.account}`,
      });
    }
    if (!Number.isSafeInteger(p?.amount) || p.amount === 0) {
      wholeAmounts = false;
      malformed(`posting amounts must be whole, non-zero francs (${String(p?.account)})`);
    }
  }
  if (wholeAmounts && !sumsToZero(entry.postings)) {
    problems.push({ code: 'NOT_BALANCED', detail: 'postings do not sum to zero' });
  }
  if (entry.type === 'POT_CORRECTION' || entry.type === 'CLAWBACK') {
    if (!isSeq(entry.metadata?.forReversalOfSeq)) {
      malformed(`a ${entry.type} records metadata.forReversalOfSeq`);
    }
    // H2: "held" comes from ledger balances only; no self-declared figure is accepted.
    const allowedKeys =
      entry.type === 'CLAWBACK'
        ? ['forReversalOfSeq', 'solidarityPayoutSeq']
        : ['forReversalOfSeq'];
    const extra = Object.keys(entry.metadata ?? {}).filter((k) => !allowedKeys.includes(k));
    if (extra.length > 0)
      malformed(`a ${entry.type} carries no other metadata (${extra.join(', ')})`);
    const payoutSeq = entry.metadata?.solidarityPayoutSeq;
    if (payoutSeq !== undefined && payoutSeq !== null && !isSeq(payoutSeq)) {
      malformed('metadata.solidarityPayoutSeq must be a seq or null');
    }
  }
  if (entry.type === 'CLAWBACK_RELEASE') {
    // Q1, Q3, H2: the amounts are rebuilt from the ledger; the entry only names what it releases.
    const m = entry.metadata ?? {};
    if (!isSeq(m.clawbackSeq) || !isSeq(m.releasedBySeq))
      malformed('a CLAWBACK_RELEASE records metadata.clawbackSeq and metadata.releasedBySeq');
    const extra = Object.keys(m).filter((k) => k !== 'clawbackSeq' && k !== 'releasedBySeq');
    if (extra.length > 0)
      malformed(`a CLAWBACK_RELEASE carries no other metadata (${extra.join(', ')})`);
  }
  if (entry.type === 'DISBURSEMENT_RETURNED' && !isSeq(entry.metadata?.sentSeq)) {
    malformed('a DISBURSEMENT_RETURNED records metadata.sentSeq');
  }
  if (entry.type === 'DISBURSEMENT_REFUNDED') {
    const m = entry.metadata ?? {};
    if (!isSeq(m.completedSeq)) malformed('a DISBURSEMENT_REFUNDED records metadata.completedSeq');
    if (typeof m.feeKept !== 'number' || !Number.isSafeInteger(m.feeKept) || m.feeKept < 0)
      malformed('a DISBURSEMENT_REFUNDED records metadata.feeKept (whole francs)');
    // Owner Q2: a loan refund records paidBack (checked against the purpose in inflight-checks.ts).
    if (
      m.paidBack !== undefined &&
      (typeof m.paidBack !== 'number' || !Number.isSafeInteger(m.paidBack) || m.paidBack < 0)
    )
      malformed('metadata.paidBack must be whole francs');
    const extra = Object.keys(m).filter(
      (k) => k !== 'completedSeq' && k !== 'feeKept' && k !== 'paidBack',
    );
    if (extra.length > 0)
      malformed(`a DISBURSEMENT_REFUNDED carries no other metadata (${extra.join(', ')})`);
  }
  if (entry.type === 'REVERSAL') {
    if (!isSeq(entry.metadata?.reversesSeq)) malformed('a REVERSAL records metadata.reversesSeq');
  }
  // Shapes and fees are checked only on entries whose accounts and amounts are sound.
  if (problems.length === 0) problems.push(...shapeProblems(entry), ...feeProblems(entry));
  return problems;
}
