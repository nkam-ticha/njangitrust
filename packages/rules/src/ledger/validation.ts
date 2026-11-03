// Shape checks of a ledger entry (2.5): known type and accounts, whole non-zero amounts that sum to
// zero, ISO 8601 UTC time, canonical metadata, and only the accounts each transaction type uses.

import { canonicalJSON } from '../crypto';
import { parseAccount, type AccountKind } from './accounts';
import { sumsToZero } from './postings';
import { TRANSACTION_TYPES, type LedgerEntry, type TransactionType } from './types';

/** Problem codes reported by the ledger checks (hash chain, entries, balances, export). */
export type LedgerProblemCode =
  | 'SEQ_GAP'
  | 'GROUP_MISMATCH'
  | 'PREV_HASH_MISMATCH'
  | 'HASH_MISMATCH'
  | 'MALFORMED_TRANSACTION'
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
  WITHDRAWAL_COMPLETED: ['PAYABLE', 'GENERAL_FUND', 'CASH'],
  LOAN_DISBURSED: ['RECEIVABLE', 'GENERAL_FUND', 'CASH'],
  SOLIDARITY_DISBURSED: ['SOLIDARITY_FUND', 'GENERAL_FUND', 'CASH'],
  LEAVER_REFUND: ['PAYABLE', 'GENERAL_FUND'],
  FUND_DISTRIBUTION: ['GENERAL_FUND', 'PAYABLE'],
  POT_ASSIGNED: ['POT', 'PAYABLE'],
  REVERSAL: 'ANY',
  EVENT: [],
};

const isNullableString = (v: unknown) => v === null || typeof v === 'string';

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
  if (entry.type === 'REVERSAL') {
    const seq = entry.metadata?.reversesSeq;
    if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 1) {
      malformed('a REVERSAL records metadata.reversesSeq');
    }
  }
  return problems;
}
