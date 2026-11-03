// Ledger records (2.4 LedgerTransaction and LedgerPosting, 2.5, D6).

import type { JsonObject } from '../crypto';
import type { Fcfa } from '../money';

/** 2.5: one line of a transaction. Debit positive, credit negative. */
export interface Posting {
  account: string;
  amount: Fcfa;
}

/**
 * 2.5 transaction types. POT_ASSIGNED is an addition: it moves a bidding round's pot to the
 * winner's payable when the bid closes (R8.3), because contributions paid before the close have no
 * beneficiary yet.
 */
export const TRANSACTION_TYPES = [
  'PAYMENT_RECEIVED',
  'FINE_ASSESSED',
  'BID_ASSESSED',
  'AUTO_SETTLEMENT',
  'WITHDRAWAL_COMPLETED',
  'LOAN_DISBURSED',
  'SOLIDARITY_DISBURSED',
  'LEAVER_REFUND',
  'FUND_DISTRIBUTION',
  'POT_ASSIGNED',
  'REVERSAL',
  'EVENT',
] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/** What a service asks the ledger to append. Times are ISO 8601 UTC strings (D6). */
export interface LedgerEntry {
  id: string;
  type: TransactionType;
  occurredAt: string;
  roundId: string | null;
  membershipId: string | null;
  refType: string | null;
  refId: string | null;
  descriptionFr: string;
  descriptionEn: string;
  /** Integers, strings, booleans and null only (canonical JSON). */
  metadata: JsonObject;
  postings: Posting[];
}

/** 2.5: a stored, hash-chained transaction. `seq` is gap-free per group, starting at 1. */
export interface LedgerTransaction extends LedgerEntry {
  groupId: string;
  seq: number;
  prevHash: string;
  hash: string;
}
