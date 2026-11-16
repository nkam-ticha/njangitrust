// Member statements (spec 2.14, FSD STA-01): the shapes shared by the statement rules.
// Everything here is plain data: integers (FCFA), strings and booleans, so a statement can be
// hashed with canonical JSON (2.5, D6) and compared byte for byte.

import type { Fcfa } from '../money';

/** 2.14: what a statement lists, in the order it prints. */
export const STATEMENT_CATEGORIES = [
  'contributions',
  'solidarityContributions',
  'payouts',
  'withdrawals',
  'loans',
  'repayments',
  'fines',
  'bids',
  'fees',
  'supportReceived',
] as const;

export type StatementCategory = (typeof STATEMENT_CATEGORIES)[number];

/** Where a line comes from, so the PDF can word it without guessing. */
export type StatementLineKind =
  | 'CONTRIBUTION'
  | 'SHORTFALL'
  | 'SOLIDARITY'
  | 'ROUND_PAYOUT'
  | 'SHORTFALL_REFUND'
  | 'POT'
  | 'FUND_SHARE'
  | 'REFUND'
  | 'WITHDRAWAL'
  | 'LOAN'
  | 'INSTALLMENT'
  | 'FINE'
  | 'BID'
  | 'WITHDRAWAL_FEE'
  | 'LOAN_FEE'
  | 'CORRECTION_FEE'
  | 'SOLIDARITY_PAYOUT'
  | 'INSTALLMENT_REFUND'
  | 'CLAWBACK'
  | 'CLAWBACK_RELEASE';

/** One line of a member's statement. `amount` is negative on a line that undoes an earlier one. */
export interface StatementLine {
  category: StatementCategory;
  kind: StatementLineKind;
  /** ISO 8601 UTC. */
  at: string;
  /** The ledger transaction it comes from; null for a line taken from an obligation. */
  seq: number | null;
  amount: Fcfa;
  /** The round of a contribution, when known. */
  roundNumber: number | null;
  /** R3.5: on time or late; null when it does not apply or is unknown. */
  onTime: boolean | null;
  /** Payouts: the collection fee deducted from this credit (R4.2); 0 elsewhere. */
  feeShare: Fcfa;
  /** Loans: the interest booked with the loan (R7.2); 0 elsewhere. */
  interest: Fcfa;
  /** True when the line undoes an earlier one (a REVERSAL or a refunded disbursement). */
  reversal: boolean;
}

/** A statement period: `start` inclusive, `end` exclusive, both ISO 8601 UTC. */
export interface StatementPeriod {
  start: string;
  end: string;
}

/** The facts about an obligation a statement needs (spec 2.4 Obligation). */
export interface ObligationFact {
  id: string;
  /** The member who owes it. */
  membershipId: string;
  kind:
    | 'CONTRIBUTION'
    | 'SOLIDARITY'
    | 'FINE'
    | 'LOAN_INSTALLMENT'
    | 'BID'
    | 'SHORTFALL_SHARE'
    | 'CORRECTION';
  amount: Fcfa;
  roundId: string | null;
  roundNumber: number | null;
  /** ISO 8601 UTC. */
  dueAt: string;
  status: 'DUE' | 'PAID' | 'SETTLED' | 'CANCELLED';
  /** ISO 8601 UTC; null while DUE. */
  paidAt: string | null;
  /** R3.5: set when paid. */
  onTime: boolean | null;
}

/** Totals per category, plus the two figures a reader needs to follow the arithmetic. */
export interface StatementTotals {
  contributions: Fcfa;
  solidarityContributions: Fcfa;
  payouts: Fcfa;
  withdrawals: Fcfa;
  loans: Fcfa;
  repayments: Fcfa;
  fines: Fcfa;
  bids: Fcfa;
  fees: Fcfa;
  supportReceived: Fcfa;
  /** Collection fees already deducted from the payouts above (R4.2); informational. */
  payoutFeeShares: Fcfa;
  /** Interest booked on the loans above (R7.2); informational. */
  loanInterest: Fcfa;
}

/** R14: the score as a statement prints it. */
export interface StatementReliability {
  /** R14.2: true with fewer than 3 due items; there is no score then. */
  newMember: boolean;
  score: number | null;
  onTime: number;
  due: number;
  /** The `reliabilityWindow` of the group's rule set. */
  window: number;
}

/** 2.14: everything the verification code covers (names are not part of it). */
export interface StatementData {
  version: 1;
  groupId: string;
  membershipId: string;
  language: 'fr' | 'en';
  period: StatementPeriod;
  /** ISO 8601 UTC. */
  issuedAt: string;
  lines: StatementLine[];
  totals: StatementTotals;
  reliability: StatementReliability;
}
