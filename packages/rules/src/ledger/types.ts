// Ledger records (2.4 LedgerTransaction and LedgerPosting, 2.5, D6).

import type { JsonObject } from '../crypto';
import type { Fcfa } from '../money';

/** 2.5: one line of a transaction. Debit positive, credit negative. */
export interface Posting {
  account: string;
  amount: Fcfa;
}

/**
 * 2.5 transaction types, plus: POT_ASSIGNED moves a bidding round's pot to its winner (D10);
 * POT_CORRECTION and CLAWBACK put back money a reversed payment had credited and that was already
 * paid out, right before that payment's REVERSAL (D15, D16.1). DISBURSEMENT_SENT moves money on its
 * way out to an in-flight account; WITHDRAWAL_COMPLETED, LOAN_DISBURSED and SOLIDARITY_DISBURSED
 * complete it from there, DISBURSEMENT_RETURNED gives it back when the provider fails (D18.1).
 * DISBURSEMENT_REFUNDED records a completed disbursement the operator later reversed: the money goes
 * back where the send took it from, any fee the operator keeps is borne by the general fund (D22.1).
 */
export const TRANSACTION_TYPES = [
  'PAYMENT_RECEIVED',
  'FINE_ASSESSED',
  'BID_ASSESSED',
  'AUTO_SETTLEMENT',
  'DISBURSEMENT_SENT',
  'WITHDRAWAL_COMPLETED',
  'LOAN_DISBURSED',
  'SOLIDARITY_DISBURSED',
  'DISBURSEMENT_RETURNED',
  'DISBURSEMENT_REFUNDED',
  'LEAVER_REFUND',
  'FUND_DISTRIBUTION',
  'POT_ASSIGNED',
  'POT_CORRECTION',
  'CLAWBACK',
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
