// Seeds real ledger rows for tests (there is no money service yet): entries built with the rules
// package's posting builders, sealed into the group's hash chain with `sealTransaction`, and inserted
// as the API's own database role would (the append-only and chain triggers still apply).
import { randomUUID } from 'node:crypto';
import {
  sealTransaction,
  type LedgerEntry,
  type LedgerTransaction,
  type Posting,
  type TransactionType,
} from '@njangi/rules';
import { getPrisma } from '../../src/lib/prisma';

/** A ledger entry with a real UUID and neutral descriptions; any field can be overridden. */
export function entryOf(
  type: TransactionType,
  lines: Posting[] | { postings: Posting[]; metadata: object },
  overrides: Partial<LedgerEntry> = {},
): LedgerEntry {
  const { postings, metadata } = Array.isArray(lines) ? { postings: lines, metadata: {} } : lines;
  return {
    id: randomUUID(),
    type,
    occurredAt: new Date().toISOString(),
    roundId: null,
    membershipId: null,
    refType: null,
    refId: null,
    descriptionFr: `Écriture ${type}`,
    descriptionEn: `Entry ${type}`,
    metadata: metadata as LedgerEntry['metadata'],
    postings,
    ...overrides,
  };
}

/** Appends entries to the group's ledger, in order, and returns the stored transactions. */
export async function appendLedger(
  groupId: string,
  entries: readonly LedgerEntry[],
): Promise<LedgerTransaction[]> {
  const prisma = getPrisma();
  const last = await prisma.ledgerTransaction.findFirst({
    where: { groupId },
    orderBy: { seq: 'desc' },
    select: { seq: true, hash: true },
  });
  let previous: Pick<LedgerTransaction, 'seq' | 'hash'> | null = last;
  const sealed: LedgerTransaction[] = [];
  for (const entry of entries) {
    const tx = sealTransaction({ groupId, previous, entry });
    sealed.push(tx);
    previous = tx;
  }
  await prisma.$transaction(async (db) => {
    for (const tx of sealed) {
      await db.ledgerTransaction.create({
        data: {
          id: tx.id,
          groupId,
          seq: tx.seq,
          type: tx.type,
          occurredAt: new Date(tx.occurredAt),
          roundId: tx.roundId,
          membershipId: tx.membershipId,
          refType: tx.refType,
          refId: tx.refId,
          descriptionFr: tx.descriptionFr,
          descriptionEn: tx.descriptionEn,
          metadata: tx.metadata,
          prevHash: tx.prevHash,
          hash: tx.hash,
          postings: { create: tx.postings.map((p) => ({ account: p.account, amount: p.amount })) },
        },
      });
    }
  });
  return sealed;
}
