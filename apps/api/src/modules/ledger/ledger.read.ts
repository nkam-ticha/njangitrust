import {
  availableForLoans,
  computeBalances,
  summarizeBalances,
  type LedgerTransaction,
  type TransactionType,
} from '@njangi/rules';
import { getPrisma } from '../../lib/prisma';
import { authorizeGroup } from '../../permissions';
import { readChain } from '../statements/ledger-read';
import { ledgerError } from './ledger.errors';

function dto(row: LedgerTransaction) {
  return {
    id: row.id,
    seq: row.seq,
    type: row.type,
    occurredAt: row.occurredAt,
    roundId: row.roundId,
    membershipId: row.membershipId,
    refType: row.refType,
    refId: row.refId,
    descriptionFr: row.descriptionFr,
    descriptionEn: row.descriptionEn,
    metadata: row.metadata,
    postings: row.postings,
    prevHash: row.prevHash,
    hash: row.hash,
  };
}

export async function readLedger(
  userId: string,
  groupId: string,
  input: {
    before?: number;
    limit: number;
    membershipId?: string;
    type?: TransactionType;
    from?: Date;
    to?: Date;
  },
) {
  await authorizeGroup(userId, groupId, 'group.ledger.read');
  const where = {
    groupId,
    ...(input.before ? { seq: { lt: input.before } } : {}),
    ...(input.membershipId ? { membershipId: input.membershipId } : {}),
    ...(input.type ? { type: input.type } : {}),
    ...(input.from || input.to
      ? {
          occurredAt: {
            ...(input.from ? { gte: input.from } : {}),
            ...(input.to ? { lte: input.to } : {}),
          },
        }
      : {}),
  };
  const rows = await getPrisma().ledgerTransaction.findMany({
    where,
    orderBy: { seq: 'desc' },
    take: input.limit + 1,
    include: { postings: { select: { account: true, amount: true } } },
  });
  const hasMore = rows.length > input.limit;
  const page = rows.slice(0, input.limit);
  return {
    entries: page.map((row) =>
      dto({
        ...row,
        occurredAt: row.occurredAt.toISOString(),
        metadata: (row.metadata ?? {}) as LedgerTransaction['metadata'],
        postings: row.postings,
        type: row.type,
      }),
    ),
    nextBefore: hasMore ? (page.at(-1)?.seq ?? null) : null,
  };
}

export async function readLedgerEntry(userId: string, groupId: string, seq: number) {
  await authorizeGroup(userId, groupId, 'group.ledger.read');
  const row = await getPrisma().ledgerTransaction.findUnique({
    where: { groupId_seq: { groupId, seq } },
    include: { postings: { select: { account: true, amount: true } } },
  });
  if (!row) throw ledgerError('LEDGER_ENTRY_NOT_FOUND');
  return dto({
    ...row,
    occurredAt: row.occurredAt.toISOString(),
    metadata: (row.metadata ?? {}) as LedgerTransaction['metadata'],
    postings: row.postings,
    type: row.type,
  });
}

export async function readFunds(userId: string, groupId: string) {
  await authorizeGroup(userId, groupId, 'group.funds.read');
  const chain = await readChain(getPrisma(), groupId);
  const summary = summarizeBalances(computeBalances(chain));
  return { ...summary, availableForLoans: availableForLoans({ summary }) };
}
