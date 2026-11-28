// D40.2, Q7: a group between two cycles waits for its admin; there is no automatic start. The admin is
// told when the cycle closes (cycles.close.ts) and reminded every 7 days after, once per week, by the
// same scan that closes cycles. Each reminder is recorded in the audit log, which makes it idempotent.
import { AfterCommit } from '../../lib/after-commit';
import { clock } from '../../lib/clock';
import { getPrisma, withTransaction } from '../../lib/prisma';
import { audit } from '../audit';
import { createNotifications } from '../notifications';
import { adminStartNotice } from './cycles.close';

const WEEK_MS = 7 * 24 * 3_600_000;

/** Sends this week's reminder for every waiting group that has not had it. Returns how many were sent. */
export async function remindAdminsBetweenCycles(now: Date = clock.now()): Promise<number> {
  // Each waiting group's LATEST cycle first (an older closed cycle is not what the group waits
  // after), then the 7-day check on that one.
  const groups = await getPrisma().group.findMany({
    where: { status: 'ACTIVE', currentCycleId: null },
    select: {
      cycles: {
        orderBy: { number: 'desc' },
        take: 1,
        select: { id: true, number: true, groupId: true, closedAt: true },
      },
    },
    take: 500,
  });
  const latest = groups
    .map((group) => group.cycles[0])
    .filter(
      (cycle): cycle is NonNullable<typeof cycle> =>
        !!cycle && cycle.closedAt !== null && cycle.closedAt <= new Date(now.getTime() - WEEK_MS),
    );
  let sent = 0;
  for (const cycle of latest) {
    const week = Math.floor((now.getTime() - cycle.closedAt!.getTime()) / WEEK_MS);
    if (week < 1) continue;
    const target = `Cycle:${cycle.id}:reminder:${week}`;
    const effects = new AfterCommit();
    const done = await withTransaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Group" WHERE "id" = ${cycle.groupId}::uuid FOR UPDATE`;
      const group = await tx.group.findUnique({
        where: { id: cycle.groupId },
        select: { status: true, currentCycleId: true },
      });
      if (!group || group.status !== 'ACTIVE' || group.currentCycleId) return false;
      const already = await tx.auditLog.count({
        where: { action: 'cycle.reminder', groupId: cycle.groupId, target },
      });
      if (already > 0) return false;
      const admin = await tx.membership.findFirst({
        where: { groupId: cycle.groupId, role: 'ADMIN', status: { in: ['ACTIVE', 'LEAVING'] } },
        select: { userId: true },
      });
      if (!admin) return false;
      await audit(
        {
          action: 'cycle.reminder',
          groupId: cycle.groupId,
          target,
          details: { week },
          system: true,
        },
        tx,
      );
      await createNotifications(
        await adminStartNotice(tx, cycle.groupId, cycle.number, admin.userId),
        effects,
        tx,
      );
      return true;
    });
    if (done) {
      await effects.run();
      sent += 1;
    }
  }
  return sent;
}
