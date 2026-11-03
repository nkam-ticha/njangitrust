// Test helpers for building ledgers quickly. Not part of the package's public API.

import { sealTransaction } from './hash-chain';
import type { LedgerEntry, LedgerTransaction, Posting, TransactionType } from './types';

export const TEST_GROUP = '9b2e0c4e-1111-4a5b-8c9d-000000000001';

let counter = 0;

/** A valid entry of the given type and postings; any field can be overridden. */
export function entry(
  type: TransactionType,
  postings: Posting[],
  overrides: Partial<LedgerEntry> = {},
): LedgerEntry {
  counter += 1;
  return {
    id: `tx-${counter}`,
    type,
    occurredAt: new Date(Date.UTC(2026, 10, 1) + counter * 60_000).toISOString(),
    roundId: null,
    membershipId: null,
    refType: null,
    refId: null,
    descriptionFr: `Écriture ${counter}`,
    descriptionEn: `Entry ${counter}`,
    metadata: {},
    postings,
    ...overrides,
  };
}

/** Seals entries one after the other into a chain for `groupId`. */
export function chainOf(entries: LedgerEntry[], groupId = TEST_GROUP): LedgerTransaction[] {
  const out: LedgerTransaction[] = [];
  for (const e of entries)
    out.push(sealTransaction({ groupId, previous: out.at(-1) ?? null, entry: e }));
  return out;
}

/** A fine on member SEED and its payment (no fee): gives a test group's general fund cash to lend. */
export function seedFund(amount: number): LedgerEntry[] {
  return [
    entry('FINE_ASSESSED', [
      { account: 'receivable:member:SEED', amount },
      { account: 'fund:general', amount: -amount },
    ]),
    entry('PAYMENT_RECEIVED', [
      { account: 'cash:provider', amount },
      { account: 'receivable:member:SEED', amount: -amount },
    ]),
  ];
}
