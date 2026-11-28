// START_CYCLE (L1, admin; R1.1, R1.2, R2.1, R2.3, FSD GRP-02/03, D40): at least 3 active members,
// then the money modules draw or keep the order and open the rounds (through the governance port).
// The group FORMING starts its first cycle; between two cycles (D40.2) it starts the next one, with
// the admin's chosen first payout date and time.
import { canStartCycle } from '@njangi/rules';
import { cycleActionTexts } from '@njangi/shared/i18n/server/cycles';
import { groupErrorTexts } from '@njangi/shared/i18n/server/groups';
import { z } from 'zod';
import { AppError, defineErrors } from '../../lib/errors';
import { bilingual } from '../../lib/texts';
import type { Db } from '../../lib/prisma';
import { ui } from '../../lib/texts';
import { authorizeGroup } from '../../permissions';
import { audit } from '../audit';
import { checkNextCycleFirstPayout, previewNextCycle } from '../cycles';
import { defineActionHandler } from '../pending-actions';
import { moneyOperation } from '../proposals';

const cycleError = defineErrors({
  CYCLE_ALREADY_STARTED: { status: 409, text: groupErrorTexts.CYCLE_ALREADY_STARTED },
  CYCLE_START_UNAVAILABLE: { status: 409, text: groupErrorTexts.CYCLE_START_UNAVAILABLE },
});

const args = z.strictObject({
  groupId: z.string().uuid(),
  /** D40.2: only for a cycle after the first; the admin's chosen first payout, or omitted for the
   * suggested one (the plain "start" button, or the agent). */
  firstPayoutAt: z.string().datetime({ offset: true }).optional(),
});

async function checkFirstCycle(db: Db, userId: string, groupId: string) {
  await authorizeGroup(userId, groupId, 'group.cycles.start', db);
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

/** Which branch applies: FORMING (first cycle, unchanged flow) or BETWEEN_CYCLES (D40.2). */
async function phaseOf(db: Db, userId: string, groupId: string) {
  const access = await authorizeGroup(userId, groupId, 'group.cycles.start', db);
  if (access.group.status === 'FORMING') return 'FORMING' as const;
  const group = await db.group.findUniqueOrThrow({
    where: { id: groupId },
    select: { currentCycleId: true },
  });
  if (!group.currentCycleId) return 'BETWEEN_CYCLES' as const;
  throw cycleError('CYCLE_ALREADY_STARTED');
}

export const startCycleHandler = defineActionHandler({
  type: 'START_CYCLE',
  level: 'L1',
  args,

  async prepare(ctx, a) {
    const phase = await phaseOf(ctx.db, ctx.userId, a.groupId);
    if (phase === 'FORMING') {
      const active = await checkFirstCycle(ctx.db, ctx.userId, a.groupId);
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
    }
    const preview = await previewNextCycle(ctx.db, a.groupId, ctx.now);
    const allowed = canStartCycle(preview.participantCount);
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
    const firstPayoutAt = a.firstPayoutAt
      ? new Date(a.firstPayoutAt)
      : preview.suggestedFirstPayoutAt;
    await checkNextCycleFirstPayout(ctx.db, a.groupId, firstPayoutAt, ctx.now);
    const orderNote = bilingual(
      preview.orderKind === 'BIDDING'
        ? cycleActionTexts.noteBidding
        : preview.orderKind === 'KEPT'
          ? cycleActionTexts.noteKept
          : cycleActionTexts.noteDrawn,
    );
    const countNote =
      preview.participantCount === 1
        ? ui((c) => c.startCycle.body_one, { count: preview.participantCount })
        : ui((c) => c.startCycle.body_other, { count: preview.participantCount });
    return {
      title: ui((c) => c.confirmation.actions.startCycle.title, { cycle: preview.number }),
      lines: [],
      total: null,
      notes: [
        countNote,
        orderNote,
        bilingual(cycleActionTexts.noteValidAtConfirm),
        ...(preview.newcomerCount > 0
          ? [
              bilingual(
                preview.newcomerCount === 1
                  ? cycleActionTexts.noteNewcomers_one
                  : cycleActionTexts.noteNewcomers_other,
                { count: preview.newcomerCount },
              ),
            ]
          : []),
      ],
      confirmLabel: ui((c) => c.confirmation.actions.startCycle.button),
    };
  },

  async execute(ctx, a) {
    const phase = await phaseOf(ctx.db, ctx.userId, a.groupId);
    const startCycle = moneyOperation('startCycle');
    if (!startCycle) throw cycleError('CYCLE_START_UNAVAILABLE');
    let firstPayoutAt: Date | undefined;
    if (phase === 'FORMING') {
      await checkFirstCycle(ctx.db, ctx.userId, a.groupId);
    } else {
      const preview = await previewNextCycle(ctx.db, a.groupId, ctx.now);
      const allowed = canStartCycle(preview.participantCount);
      if (!allowed.ok) throw cycleError('CYCLE_START_UNAVAILABLE');
      firstPayoutAt = a.firstPayoutAt ? new Date(a.firstPayoutAt) : preview.suggestedFirstPayoutAt;
      await checkNextCycleFirstPayout(ctx.db, a.groupId, firstPayoutAt, ctx.now);
    }
    const started = await startCycle(
      ctx.db,
      { groupId: a.groupId, startedByUserId: ctx.userId, firstPayoutAt },
      ctx.effects,
    );
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
