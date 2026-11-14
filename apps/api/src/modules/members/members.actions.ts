// LEAVE_AT_CYCLE_END (L1, R12.2, FSD MEM-01): the member keeps every obligation and right until the
// cycle closes, when the cycles module ends the membership. The admin must first be replaced.
import { canAnnounceLeave } from '@njangi/rules';
import { proposalErrorTexts } from '@njangi/shared/i18n/server/proposals';
import { groupErrorTexts } from '@njangi/shared/i18n/server/groups';
import { z } from 'zod';
import { defineErrors } from '../../lib/errors';
import type { Db } from '../../lib/prisma';
import { ui } from '../../lib/texts';
import { authorizeGroup } from '../../permissions';
import { audit } from '../audit';
import { postSystemMessage } from '../chat';
import { defineActionHandler } from '../pending-actions';

const leaveError = defineErrors({
  ALREADY_LEAVING: { status: 409, text: proposalErrorTexts.ALREADY_LEAVING },
  ADMIN_MUST_CHANGE_FIRST: { status: 409, text: proposalErrorTexts.ADMIN_MUST_CHANGE_FIRST },
  NOT_ACTIVE_MEMBER: { status: 403, text: groupErrorTexts.NOT_ACTIVE_MEMBER },
  PROPOSALS_BEFORE_FIRST_CYCLE: {
    status: 409,
    text: proposalErrorTexts.PROPOSALS_BEFORE_FIRST_CYCLE,
  },
});

const args = z.strictObject({ groupId: z.string().uuid() });

async function check(db: Db, userId: string, groupId: string) {
  const access = await authorizeGroup(userId, groupId, 'group.leave', db);
  if (access.group.status === 'FORMING') throw leaveError('PROPOSALS_BEFORE_FIRST_CYCLE');
  if (access.membership.role === 'ADMIN') throw leaveError('ADMIN_MUST_CHANGE_FIRST');
  const allowed = canAnnounceLeave(access.membership.status);
  if (!allowed.ok) throw leaveError(allowed.code);
  return access;
}

export const leaveAtCycleEndHandler = defineActionHandler({
  type: 'LEAVE_AT_CYCLE_END',
  level: 'L1',
  args,

  async prepare(ctx, a) {
    await check(ctx.db, ctx.userId, a.groupId);
    return {
      title: ui((c) => c.confirmation.actions.announceLeave.title),
      lines: [],
      total: null,
      notes: [],
      confirmLabel: ui((c) => c.confirmation.actions.announceLeave.button),
    };
  },

  async execute(ctx, a) {
    const access = await check(ctx.db, ctx.userId, a.groupId);
    await ctx.db.membership.update({
      where: { id: access.membership.id },
      data: { status: 'LEAVING' },
    });
    const me = await ctx.db.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: { name: true },
    });
    await postSystemMessage(
      a.groupId,
      ui((c) => c.chat.system.memberLeaving, { name: me.name }),
      ctx.effects,
      ctx.db,
    );
    await audit(
      {
        action: 'member.leaving',
        actorUserId: ctx.userId,
        groupId: a.groupId,
        target: `Membership:${access.membership.id}`,
      },
      ctx.db,
    );
    return {
      outcome: 'done',
      resultRef: access.membership.id,
      summary: ui((c) => c.confirmation.actions.announceLeave.done),
    };
  },
});
