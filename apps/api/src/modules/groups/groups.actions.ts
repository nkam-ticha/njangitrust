// START_CYCLE (L1, admin; R1.1, R1.2, R2.1, R2.3, FSD GRP-02, GRP-03): at least 3 active members,
// then the money modules draw the order and open the rounds (through the governance port).
import { canStartCycle } from '@njangi/rules';
import { groupErrorTexts } from '@njangi/shared/i18n/server/groups';
import { z } from 'zod';
import { AppError, defineErrors } from '../../lib/errors';
import type { Db } from '../../lib/prisma';
import { ui } from '../../lib/texts';
import { authorizeGroup } from '../../permissions';
import { audit } from '../audit';
import { defineActionHandler } from '../pending-actions';
import { moneyPort } from '../proposals';

const cycleError = defineErrors({
  CYCLE_ALREADY_STARTED: { status: 409, text: groupErrorTexts.CYCLE_ALREADY_STARTED },
  CYCLE_START_UNAVAILABLE: { status: 409, text: groupErrorTexts.CYCLE_START_UNAVAILABLE },
});

const args = z.strictObject({ groupId: z.string().uuid() });

async function check(db: Db, userId: string, groupId: string) {
  const access = await authorizeGroup(userId, groupId, 'group.cycles.start', db);
  if (access.group.status !== 'FORMING') throw cycleError('CYCLE_ALREADY_STARTED');
  const active = await db.membership.count({ where: { groupId, status: 'ACTIVE' } });
  const allowed = canStartCycle(active);
  if (!allowed.ok) {
    const missing = allowed.code === 'NOT_ENOUGH_MEMBERS' ? allowed.minimum - allowed.count : 0;
    throw new AppError(
      allowed.code,
      409,
      ui((c) => (missing === 1 ? c.startCycle.needMore_one : c.startCycle.needMore_other), {
        count: missing,
      }),
      { count: allowed.count },
    );
  }
  return active;
}

export const startCycleHandler = defineActionHandler({
  type: 'START_CYCLE',
  level: 'L1',
  args,

  async prepare(ctx, a) {
    const active = await check(ctx.db, ctx.userId, a.groupId);
    const pending = await ctx.db.invite.count({
      where: { groupId: a.groupId, usedAt: null, revokedAt: null, expiresAt: { gt: ctx.now } },
    });
    return {
      title: ui((c) => c.confirmation.actions.startCycle.title, { cycle: 1 }),
      lines: [],
      total: null,
      notes: [
        ui((c) => (active === 1 ? c.startCycle.body_one : c.startCycle.body_other), {
          count: active,
        }),
        ...(pending > 0
          ? [
              ui(
                (c) =>
                  pending === 1
                    ? c.startCycle.pendingInvites_one
                    : c.startCycle.pendingInvites_other,
                { count: pending },
              ),
            ]
          : []),
      ],
      confirmLabel: ui((c) => c.confirmation.actions.startCycle.button),
    };
  },

  async execute(ctx, a) {
    await check(ctx.db, ctx.userId, a.groupId);
    const port = moneyPort();
    if (!port) throw cycleError('CYCLE_START_UNAVAILABLE');
    const started = await port.startCycle(ctx.db, {
      groupId: a.groupId,
      startedByUserId: ctx.userId,
    });
    await audit(
      {
        action: 'cycle.started',
        actorUserId: ctx.userId,
        groupId: a.groupId,
        target: `Group:${a.groupId}`,
        details: { cycle: started.cycleNumber },
      },
      ctx.db,
    );
    return {
      outcome: 'done',
      resultRef: a.groupId,
      summary: ui((c) => c.confirmation.actions.startCycle.done),
    };
  },
});
