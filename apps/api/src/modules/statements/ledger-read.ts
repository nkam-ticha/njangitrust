// Reading a group's ledger for statements and the audit export. The ledger tables are only ever read
// here (rule 3: append-only, never updated); each row becomes the rules package's `LedgerTransaction`,
// the shape the hash chain and the verifier work on.
import { genesisHash, type JsonObject, type LedgerTransaction } from '@njangi/rules';
import type { Db } from '../../lib/prisma';

/** The whole chain of a group, oldest first. */
export async function readChain(db: Db, groupId: string): Promise<LedgerTransaction[]> {
  const rows = await db.ledgerTransaction.findMany({
    where: { groupId },
    orderBy: { seq: 'asc' },
    include: { postings: { select: { account: true, amount: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    groupId: r.groupId,
    seq: r.seq,
    type: r.type,
    occurredAt: r.occurredAt.toISOString(),
    roundId: r.roundId,
    membershipId: r.membershipId,
    refType: r.refType,
    refId: r.refId,
    descriptionFr: r.descriptionFr,
    descriptionEn: r.descriptionEn,
    metadata: (r.metadata ?? {}) as JsonObject,
    postings: r.postings.map((p) => ({ account: p.account, amount: p.amount })),
    prevHash: r.prevHash,
    hash: r.hash,
  }));
}

/** The hash a statement is tied to: the last transaction's, or the genesis hash of an empty ledger. */
export function headHashOf(groupId: string, chain: readonly LedgerTransaction[]): string {
  return chain.at(-1)?.hash ?? genesisHash(groupId);
}
