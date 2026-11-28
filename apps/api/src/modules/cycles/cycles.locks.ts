// One lock order for everything that touches a group's rounds and ledger (second ledger audit): the
// ROUND rows first (ordered by id), then the group, then the membership. Fines and bid closes already
// lock their round before the group (the ledger entry takes it), so every cycle operation that
// writes rounds takes the same order; otherwise a fine on round k and the opening of round k + 1,
// the close of the cycle or a rotation change could each wait for the other and Postgres would abort one.
import type { Prisma } from '../../lib/prisma';

/** Locks every round of the group (by id), then the group row. Call before reading what you will write. */
export async function lockRoundsThenGroup(tx: Prisma.TransactionClient, groupId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Round" WHERE "groupId" = ${groupId}::uuid ORDER BY "id" FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "Group" WHERE "id" = ${groupId}::uuid FOR UPDATE`;
}
