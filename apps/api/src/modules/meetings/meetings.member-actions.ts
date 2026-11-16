// PendingAction handlers for a member's own meeting actions (spec 4.5, L1): MEETING_CHECK_IN,
// MEETING_EXCUSE and MEETING_AGENDA_ADD. In the app the member's tap acts directly (the tap is the
// confirmation); these handlers exist for the agent's tools (`check_in`, `send_absence_excuse`,
// `add_agenda_item`), which can only propose the action as a card the member confirms.
import { textSchema } from '@njangi/shared/contracts/common';
import { AGENDA_ITEM_MAX_CHARS, EXCUSE_MAX_CHARS } from '@njangi/shared/contracts/meetings';
import { meetingTexts as t } from '@njangi/shared/i18n/server/meetings';
import { z } from 'zod';
import { getPrisma } from '../../lib/prisma';
import { bilingual, ui } from '../../lib/texts';
import type { AuthActor } from '../../permissions';
import { createPendingAction, defineActionHandler, type ActionOrigin } from '../pending-actions';
import { addAgendaItem, checkIn, sendExcuse } from './meetings.attendance';
import { meetingError } from './meetings.errors';
import { agendaItemRefusal, checkInRefusal, excuseRefusal } from './meetings.guards';
import { loadMeeting } from './meetings.load';

const uuid = z.string().uuid();
const checkInArgs = z.strictObject({ meetingId: uuid });
const excuseArgs = z.strictObject({ meetingId: uuid, reason: textSchema(EXCUSE_MAX_CHARS) });
const itemArgs = z.strictObject({ meetingId: uuid, text: textSchema(AGENDA_ITEM_MAX_CHARS) });

export const meetingCheckInHandler = defineActionHandler({
  type: 'MEETING_CHECK_IN',
  level: 'L1',
  args: checkInArgs,

  async prepare(ctx, a) {
    const { meeting, access } = await loadMeeting(
      ctx.db,
      ctx.userId,
      a.meetingId,
      'group.meetings.checkIn',
    );
    const mine = await ctx.db.attendance.findUnique({
      where: {
        meetingId_membershipId: { meetingId: a.meetingId, membershipId: access.membership.id },
      },
    });
    const refusal = checkInRefusal({
      status: meeting.status,
      scheduledAt: meeting.scheduledAt,
      now: ctx.now,
      alreadyPresent: mine?.present === true,
    });
    if (refusal) throw meetingError(refusal);
    return {
      title: ui((c) => c.confirmation.actions.checkIn.title),
      lines: [],
      total: null,
      notes: [],
      confirmLabel: ui((c) => c.confirmation.actions.checkIn.button),
    };
  },

  async execute(ctx, a) {
    await checkIn(ctx.userId, a.meetingId, { db: ctx.db, effects: ctx.effects });
    return {
      outcome: 'done',
      resultRef: a.meetingId,
      summary: ui((c) => c.confirmation.actions.checkIn.done),
    };
  },
});

export const meetingExcuseHandler = defineActionHandler({
  type: 'MEETING_EXCUSE',
  level: 'L1',
  args: excuseArgs,

  async prepare(ctx, a) {
    const { meeting, access } = await loadMeeting(
      ctx.db,
      ctx.userId,
      a.meetingId,
      'group.meetings.excuse',
    );
    const mine = await ctx.db.attendance.findUnique({
      where: {
        meetingId_membershipId: { meetingId: a.meetingId, membershipId: access.membership.id },
      },
    });
    const refusal = excuseRefusal({
      status: meeting.status,
      scheduledAt: meeting.scheduledAt,
      now: ctx.now,
      alreadyPresent: mine?.present === true,
    });
    if (refusal) throw meetingError(refusal);
    return {
      title: ui((c) => c.confirmation.actions.sendExcuse.title),
      lines: [],
      total: null,
      notes: [bilingual(t.excuseLine, { text: a.reason })],
      confirmLabel: ui((c) => c.confirmation.actions.sendExcuse.button),
    };
  },

  async execute(ctx, a) {
    await sendExcuse(ctx.userId, a.meetingId, a.reason, { db: ctx.db, effects: ctx.effects });
    return {
      outcome: 'done',
      resultRef: a.meetingId,
      summary: ui((c) => c.confirmation.actions.sendExcuse.done),
    };
  },
});

export const meetingAgendaAddHandler = defineActionHandler({
  type: 'MEETING_AGENDA_ADD',
  level: 'L1',
  args: itemArgs,

  async prepare(ctx, a) {
    const { meeting } = await loadMeeting(
      ctx.db,
      ctx.userId,
      a.meetingId,
      'group.meetings.agendaAdd',
    );
    const refusal = agendaItemRefusal({
      status: meeting.status,
      scheduledAt: meeting.scheduledAt,
      now: ctx.now,
      memberItems: await ctx.db.agendaItem.count({
        where: { meetingId: a.meetingId, source: 'MEMBER' },
      }),
    });
    if (refusal) throw meetingError(refusal);
    return {
      title: ui((c) => c.confirmation.actions.addAgendaItem.title),
      lines: [],
      total: null,
      notes: [bilingual(t.itemLine, { text: a.text })],
      confirmLabel: ui((c) => c.confirmation.actions.addAgendaItem.button),
    };
  },

  async execute(ctx, a) {
    await addAgendaItem(ctx.userId, a.meetingId, a.text, { db: ctx.db, effects: ctx.effects });
    return {
      outcome: 'done',
      resultRef: a.meetingId,
      summary: ui((c) => c.confirmation.actions.addAgendaItem.done),
    };
  },
});

async function groupOf(meetingId: string): Promise<string> {
  const meeting = await getPrisma().meeting.findUnique({
    where: { id: meetingId },
    select: { groupId: true },
  });
  if (!meeting) throw meetingError('MEETING_NOT_FOUND');
  return meeting.groupId;
}

const card = (
  actor: AuthActor,
  groupId: string,
  origin: ActionOrigin,
  type: string,
  args: unknown,
) => createPendingAction({ userId: actor.userId, groupId, lang: actor.lang, origin, type, args });

export async function requestCheckIn(
  actor: AuthActor,
  meetingId: string,
  origin: ActionOrigin = 'AGENT',
) {
  return card(actor, await groupOf(meetingId), origin, 'MEETING_CHECK_IN', { meetingId });
}

export async function requestExcuse(
  actor: AuthActor,
  meetingId: string,
  reason: string,
  origin: ActionOrigin = 'AGENT',
) {
  return card(actor, await groupOf(meetingId), origin, 'MEETING_EXCUSE', { meetingId, reason });
}

export async function requestAgendaItem(
  actor: AuthActor,
  meetingId: string,
  text: string,
  origin: ActionOrigin = 'AGENT',
) {
  return card(actor, await groupOf(meetingId), origin, 'MEETING_AGENDA_ADD', { meetingId, text });
}
