// Spec 2.5, 5.2, D2: the API's database user cannot UPDATE, DELETE or TRUNCATE ledger rows, and
// a trigger refuses it for every role, the schema owner included. The chain and the double entry
// are also checked by the database itself.
import { genesisHash } from '@njangi/rules';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../../src/lib/crypto';
import { createPrisma, getPrisma, type PrismaClient } from '../../src/lib/prisma';
import { createGroup, signUp } from '../helpers/factories';

let owner: PrismaClient;
let groupId: string;
let txId: string;

function entry(
  seq: number,
  prevHash: string,
  postings: Array<{ account: string; amount: number }>,
) {
  const id = newId();
  return {
    id,
    data: {
      id,
      groupId,
      seq,
      type: 'EVENT' as const,
      occurredAt: new Date(),
      descriptionFr: 'Test',
      descriptionEn: 'Test',
      prevHash,
      hash: `test-${id}`,
      postings: { create: postings },
    },
  };
}

beforeAll(async () => {
  owner = createPrisma(process.env.TEST_MIGRATION_DATABASE_URL!);
  const admin = await signUp();
  groupId = (await createGroup(admin)).groupId;
  const first = entry(1, genesisHash(groupId), [
    { account: 'cash:provider', amount: 10_900 },
    { account: 'fund:solidarity', amount: -10_900 },
  ]);
  await getPrisma().ledgerTransaction.create({ data: first.data });
  txId = first.id;
});

afterAll(async () => {
  await owner.$disconnect();
});

describe('ledger immutability (spec 2.5)', () => {
  it('lets the API append ledger rows', async () => {
    const row = await getPrisma().ledgerTransaction.findUniqueOrThrow({
      where: { id: txId },
      include: { postings: true },
    });
    expect(row.postings).toHaveLength(2);
  });

  it('refuses UPDATE, DELETE and TRUNCATE to njangi_app (no privilege)', async () => {
    const app = getPrisma();
    await expect(
      app.$executeRaw`UPDATE "LedgerTransaction" SET "descriptionFr" = 'x' WHERE "id" = ${txId}::uuid`,
    ).rejects.toThrow(/permission denied/i);
    await expect(
      app.$executeRaw`DELETE FROM "LedgerPosting" WHERE "transactionId" = ${txId}::uuid`,
    ).rejects.toThrow(/permission denied/i);
    await expect(app.$executeRaw`TRUNCATE "LedgerTransaction" CASCADE`).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('refuses UPDATE, DELETE and TRUNCATE to every role, the schema owner included (trigger)', async () => {
    await expect(
      owner.$executeRaw`UPDATE "LedgerPosting" SET "amount" = 1 WHERE "transactionId" = ${txId}::uuid`,
    ).rejects.toThrow(/append-only/);
    await expect(
      owner.$executeRaw`DELETE FROM "LedgerTransaction" WHERE "id" = ${txId}::uuid`,
    ).rejects.toThrow(/append-only/);
    await expect(owner.$executeRaw`TRUNCATE "LedgerPosting"`).rejects.toThrow(/append-only/);
  });

  it('keeps seq gap-free and the chain linked (invariant 5)', async () => {
    const app = getPrisma();
    const gap = entry(3, `test-${txId}`, []);
    await expect(app.ledgerTransaction.create({ data: gap.data })).rejects.toThrow(/must be 2/);
    const unlinked = entry(2, 'not-the-previous-hash', []);
    await expect(app.ledgerTransaction.create({ data: unlinked.data })).rejects.toThrow(
      /does not chain/,
    );
  });

  it('refuses postings that do not sum to zero (invariant 1)', async () => {
    const unbalanced = entry(2, `test-${txId}`, [
      { account: 'cash:provider', amount: 100 },
      { account: 'fund:general', amount: -99 },
    ]);
    await expect(getPrisma().ledgerTransaction.create({ data: unbalanced.data })).rejects.toThrow(
      /sum to 1, not zero/,
    );
  });

  it('hides Prisma’s migration history from the API user', async () => {
    await expect(getPrisma().$queryRaw`SELECT 1 FROM "_prisma_migrations" LIMIT 1`).rejects.toThrow(
      /permission denied/i,
    );
  });
});
