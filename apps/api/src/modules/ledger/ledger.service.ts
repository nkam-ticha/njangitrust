// Append-only ledger persistence (spec 2.5, D6). The Group row lock serializes concurrent writes
// for the same group while keeping unrelated groups independent.
import { randomUUID } from 'node:crypto';
import { sealTransaction, type LedgerEntry } from '@njangi/rules';
import type { Prisma } from '../../lib/prisma';
import { type Db } from '../../lib/prisma';

export async function appendLedgerEntry(
  tx: Prisma.TransactionClient,
  groupId: string,
  entry: Omit<LedgerEntry, 'id'> & { id?: string },
) {
  await tx.$queryRaw`SELECT "id" FROM "Group" WHERE "id" = ${groupId}::uuid FOR UPDATE`;
  const previousRow = await tx.ledgerTransaction.findFirst({
    where: { groupId },
    orderBy: { seq: 'desc' },
    select: { seq: true, hash: true },
  });
  const sealed = sealTransaction({
    groupId,
    previous: previousRow,
    entry: { ...entry, id: entry.id ?? randomUUID() },
  });
  return tx.ledgerTransaction.create({
    data: {
      id: sealed.id,
      groupId,
      seq: sealed.seq,
      type: sealed.type,
      occurredAt: new Date(sealed.occurredAt),
      roundId: sealed.roundId,
      membershipId: sealed.membershipId,
      refType: sealed.refType,
      refId: sealed.refId,
      descriptionFr: sealed.descriptionFr,
      descriptionEn: sealed.descriptionEn,
      metadata: sealed.metadata,
      prevHash: sealed.prevHash,
      hash: sealed.hash,
      postings: { create: sealed.postings.map((posting) => posting) },
    },
    include: { postings: true },
  });
}

export async function ledgerHead(db: Db, groupId: string) {
  return db.ledgerTransaction.findFirst({
    where: { groupId },
    orderBy: { seq: 'desc' },
    select: { seq: true, hash: true },
  });
}
