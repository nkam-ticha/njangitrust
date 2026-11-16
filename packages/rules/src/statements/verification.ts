// The statement's data record and its verification code (spec 2.14): the first 12 hex characters of
// SHA-256 over the ledger head hash followed by the canonical JSON of the statement data (the same
// shape as a ledger hash, 2.5 invariant 5), so a statement is tied to the exact ledger it came from.

import { canonicalJSON, sha256Hex } from '../crypto';
import { statementTotals } from './totals';
import type { StatementData, StatementLine, StatementReliability, StatementPeriod } from './types';

const SHA256_HEX = /^[0-9a-f]{64}$/;
const CODE = /^[0-9a-f]{12}$/;

/** Builds the record the code covers; the totals are always computed from the lines. */
export function statementData(input: {
  groupId: string;
  membershipId: string;
  language: 'fr' | 'en';
  period: StatementPeriod;
  issuedAt: string;
  lines: readonly StatementLine[];
  reliability: StatementReliability;
}): StatementData {
  return {
    version: 1,
    groupId: input.groupId,
    membershipId: input.membershipId,
    language: input.language,
    period: { start: input.period.start, end: input.period.end },
    issuedAt: input.issuedAt,
    lines: input.lines.map((l) => ({ ...l })),
    totals: statementTotals(input.lines),
    reliability: { ...input.reliability },
  };
}

/** 2.14: 12 lowercase hex characters, printed on the statement and checked at /verify/:code. */
export function statementVerificationCode(data: StatementData, ledgerHeadHash: string): string {
  if (!SHA256_HEX.test(ledgerHeadHash)) throw new RangeError('the ledger head is a SHA-256 hash');
  return sha256Hex(ledgerHeadHash + canonicalJSON(data)).slice(0, 12);
}

/** True when `code` has the shape of a verification code (so the public endpoint can refuse junk). */
export function isStatementCodeFormat(code: string): boolean {
  return CODE.test(code);
}
