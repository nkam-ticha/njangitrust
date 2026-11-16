// PendingAction handlers for the admin's meeting actions (spec 4.5, L1): MEETING_SCHEDULE,
// MEETING_CANCEL, MEETING_CLOSE, MEETING_ATTENDANCE and MEETING_PUBLISH_MINUTES. The card is drawn by
// the server from the state; `prepare` makes the same checks as the service (the same guards), so a
// card is refused for the reason the action would fail. Nothing happens until the admin confirms.
import { formatXAF } from '@njangi/shared';
import { textSchema } from '@njangi/shared/contracts/common';
import {
  EXCUSE_MAX_CHARS,
  MINUTES_MAX_CHARS,
  PLACE_MAX_CHARS,
} from '@njangi/shared/contracts/meetings';
import { meetingTexts as t } from '@njangi/shared/i18n/server/meetings';
import { z } from 'zod';
import { getPrisma } from '../../lib/prisma';
import { bilingual, ui } from '../../lib/texts';
import { authorizeGroup, type AuthActor } from '../../permissions';
import { createPendingAction, defineActionHandler, type ActionOrigin } from '../pending-actions';
import { closeMeeting, markAttendance, planClose } from './meetings.attendance';
import { meetingError } from './meetings.errors';
import { closeRefusal, markRefusal, publishRefusal, scheduleRefusal } from './meetings.guards';
import { loadMeeting, PARTICIPANT_STATUSES } from './meetings.load';
import { dateParam } from './meetings.notices';
import { publishMinutes } from './meetings.minutes';
import { cancelMeeting, scheduleMeeting } from './meetings.service';
import { readVersions } from './minutes-store';

const uuid = z.string().uuid();

const scheduleArgs = z.strictObject({
  groupId: uuid,
  scheduledAt: z.string().datetime({ offset: true }),
  place: textSchema(PLACE_MAX_CHARS),
});
const meetingArgs = z.strictObject({ meetingId: uuid });
const attendanceArgs = z.strictObject({
  meetingId: uuid,
  marks: z
    .array(z.strictObject({ membershipId: uuid, present: z.boolean() }))
    .min(1)
    .max(60),
});
const publishArgs = z.strictObject({
  meetingId: uuid,
  text: textSchema(MINUTES_MAX_CHARS),
  reason: textSchema(EXCUSE_MAX_CHARS).nullable(),
});

export const meetingScheduleHandler = defineActionHandler({
  type: 'MEETING_SCHEDULE',
  level: 'L1',
  args: scheduleArgs,

  async prepare(ctx, a) {
    await authorizeGroup(ctx.userId, a.groupId, 'group.meetings.schedule', ctx.db);
    const refusal = scheduleRefusal(new Date(a.scheduledAt), ctx.now);
    if (refusal) throw meetingError(refusal);
    return {
      title: ui((c) => c.confirmation.actions.scheduleMeeting.title),
      lines: [],
      total: null,
      notes: [
        bilingual(t.dateLine, { date: dateParam(new Date(a.scheduledAt)) }),
        bilingual(t.placeLine, { place: a.place }),
      ],
      confirmLabel: ui((c) => c.confirmation.actions.scheduleMeeting.button),
    };
  },

  async execute(ctx, a) {
    const meeting = await scheduleMeeting(
      ctx.userId,
      a.groupId,
      { scheduledAt: a.scheduledAt, place: a.place },
      { db: ctx.db, effects: ctx.effects },
    );
    return {
      outcome: 'done',
      resultRef: meeting.id,
      summary: ui((c) => c.confirmation.actions.scheduleMeeting.done),
    };
  },
});

export const meetingCancelHandler = defineActionHandler({
  type: 'MEETING_CANCEL',
  level: 'L1',
  args: meetingArgs,

  async prepare(ctx, a) {
    const { meeting } = await loadMeeting(
      ctx.db,
      ctx.userId,
      a.meetingId,
      'group.meetings.schedule',
    );
    if (meeting.status !== 'SCHEDULED') throw meetingError('MEETING_NOT_SCHEDULED');
    return {
      title: bilingual(t.cancelTitle),
      lines: [],
      total: null,
      notes: [
        bilingual(t.dateLine, { date: dateParam(meeting.scheduledAt) }),
        bilingual(t.cancelNote),
      ],
      confirmLabel: bilingual(t.cancelButton),
    };
  },

  async execute(ctx, a) {
    await cancelMeeting(ctx.userId, a.meetingId, { db: ctx.db, effects: ctx.effects });
    return { outcome: 'done', resultRef: a.meetingId, summary: bilingual(t.cancelDone) };
  },
});

export const meetingCloseHandler = defineActionHandler({
  type: 'MEETING_CLOSE',
  level: 'L1',
  args: meetingArgs,

  async prepare(ctx, a) {
    const { meeting } = await loadMeeting(
      ctx.db,
      ctx.userId,
      a.meetingId,
      'group.meetings.attendanceMark',
    );
    const refusal = closeRefusal({
      status: meeting.status,
      scheduledAt: meeting.scheduledAt,
      now: ctx.now,
    });
    if (refusal) throw meetingError(refusal);
    const plan = await planClose(ctx.db, meeting);
    const notes = [
      bilingual(t.attendanceNote, { present: plan.present, absent: plan.absent }),
      bilingual(t.closeNote),
    ];
    if (plan.fines.length > 0) {
      notes.push(
        bilingual(t.closeFineNote, {
          amount: { fr: formatXAF(plan.fineAmount, 'fr'), en: formatXAF(plan.fineAmount, 'en') },
          count: plan.fines.length,
        }),
      );
    }
    return {
      title: bilingual(t.closeTitle),
      lines: [],
      total: null,
      notes,
      confirmLabel: bilingual(t.closeButton),
    };
  },

  async execute(ctx, a) {
    await closeMeeting(ctx.userId, a.meetingId, { db: ctx.db, effects: ctx.effects });
    return { outcome: 'done', resultRef: a.meetingId, summary: bilingual(t.closeDone) };
  },
});

export const meetingAttendanceHandler = defineActionHandler({
  type: 'MEETING_ATTENDANCE',
  level: 'L1',
  args: attendanceArgs,

  async prepare(ctx, a) {
    const { meeting } = await loadMeeting(
      ctx.db,
      ctx.userId,
      a.meetingId,
      'group.meetings.attendanceMark',
    );
    const refusal = markRefusal({
      status: meeting.status,
      scheduledAt: meeting.scheduledAt,
      now: ctx.now,
    });
    if (refusal) throw meetingError(refusal);
    const ids = new Set(a.marks.map((m) => m.membershipId));
    const valid = await ctx.db.membership.count({
      where: {
        id: { in: [...ids] },
        groupId: meeting.groupId,
        status: { in: [...PARTICIPANT_STATUSES] },
      },
    });
    if (valid !== ids.size) throw meetingError('NOT_A_PARTICIPANT');
    const present = a.marks.filter((m) => m.present).length;
    return {
      title: ui((c) => c.confirmation.actions.markAttendance.title),
      lines: [],
      total: null,
      notes: [bilingual(t.attendanceNote, { present, absent: a.marks.length - present })],
      confirmLabel: ui((c) => c.confirmation.actions.markAttendance.button),
    };
  },

  async execute(ctx, a) {
    await markAttendance(
      ctx.userId,
      a.meetingId,
      { marks: a.marks },
      { db: ctx.db, effects: ctx.effects },
    );
    return {
      outcome: 'done',
      resultRef: a.meetingId,
      summary: ui((c) => c.confirmation.actions.markAttendance.done),
    };
  },
});

export const meetingPublishMinutesHandler = defineActionHandler({
  type: 'MEETING_PUBLISH_MINUTES',
  level: 'L1',
  args: publishArgs,

  async prepare(ctx, a) {
    const { meeting } = await loadMeeting(ctx.db, ctx.userId, a.meetingId, 'group.minutes.publish');
    const versions = readVersions(meeting.minutesPublished);
    const refusal = publishRefusal({
      status: meeting.status,
      latestText: versions.at(-1)?.text ?? null,
      text: a.text,
      reason: a.reason,
    });
    if (refusal) throw meetingError(refusal);
    const notes = [bilingual(t.publishNote)];
    if (versions.length > 0 && a.reason) {
      notes.push(
        bilingual(t.publishCorrectionNote, { version: versions.length + 1, reason: a.reason }),
      );
    }
    return {
      title: ui((c) => c.confirmation.actions.publishMinutes.title),
      lines: [],
      total: null,
      notes,
      confirmLabel: ui((c) => c.confirmation.actions.publishMinutes.button),
    };
  },

  async execute(ctx, a) {
    await publishMinutes(
      ctx.userId,
      a.meetingId,
      { text: a.text, ...(a.reason ? { reason: a.reason } : {}) },
      { db: ctx.db, effects: ctx.effects },
    );
    return {
      outcome: 'done',
      resultRef: a.meetingId,
      summary: ui((c) => c.confirmation.actions.publishMinutes.done),
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

export function requestScheduleMeeting(
  actor: AuthActor,
  groupId: string,
  input: { scheduledAt: string; place: string },
  origin: ActionOrigin = 'UI',
) {
  return card(actor, groupId, origin, 'MEETING_SCHEDULE', { groupId, ...input });
}

export async function requestCancelMeeting(
  actor: AuthActor,
  meetingId: string,
  origin: ActionOrigin = 'UI',
) {
  return card(actor, await groupOf(meetingId), origin, 'MEETING_CANCEL', { meetingId });
}

export async function requestCloseMeeting(
  actor: AuthActor,
  meetingId: string,
  origin: ActionOrigin = 'UI',
) {
  return card(actor, await groupOf(meetingId), origin, 'MEETING_CLOSE', { meetingId });
}

export async function requestMarkAttendance(
  actor: AuthActor,
  meetingId: string,
  marks: { membershipId: string; present: boolean }[],
  origin: ActionOrigin = 'UI',
) {
  return card(actor, await groupOf(meetingId), origin, 'MEETING_ATTENDANCE', { meetingId, marks });
}

export async function requestPublishMinutes(
  actor: AuthActor,
  meetingId: string,
  input: { text: string; reason?: string | undefined },
  origin: ActionOrigin = 'UI',
) {
  return card(actor, await groupOf(meetingId), origin, 'MEETING_PUBLISH_MINUTES', {
    meetingId,
    text: input.text,
    reason: input.reason ?? null,
  });
}
