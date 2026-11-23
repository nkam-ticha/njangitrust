// A developer deleting a member's account (D28). It is the member's own deletion (PRV-03) without
// the member's PIN and nothing else: the same blockers (admin of a group, a running cycle, money or
// an operation in flight, obligations) refuse it, and the same anonymisation runs, which also
// deletes every refresh token and bumps the session epoch so access tokens stop at once. The
// developer is recorded in the audit log in the same transaction.
import { AfterCommit } from '../../lib/after-commit';
import { clock } from '../../lib/clock';
import { withTransaction } from '../../lib/prisma';
import { audit } from '../audit';
import { accountError } from './account.errors';
import { anonymiseAccount, deletionBlocker, lockAccountOperations } from './account.service';

export async function deleteAccountAsDeveloper(userId: string, developer: string): Promise<void> {
  const effects = new AfterCommit();
  await withTransaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { deletedAt: true },
    });
    if (user.deletedAt) throw accountError('ACCOUNT_DELETED');
    // Group then membership locks, as a payment or a withdrawal takes them: one still being
    // confirmed is waited for, so the count below cannot read zero while it is uncommitted.
    await lockAccountOperations(tx, userId);
    const blocker = await deletionBlocker(tx, userId);
    if (blocker) throw accountError(blocker);
    await anonymiseAccount(tx, userId, clock.now(), effects);
    await audit(
      {
        action: 'developer.user.deleted',
        actorUserId: null,
        target: `User:${userId}`,
        details: { developer },
      },
      tx,
    );
  });
  await effects.run();
}
