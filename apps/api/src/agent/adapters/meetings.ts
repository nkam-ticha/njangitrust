// The agent's meetings port (agent/ports.ts) on the meetings module's services. Every call acts as
// the member in `ctx`; the services check the permissions (the admin-only ones refuse a member).
import { formatDateTime } from '@njangi/shared';
import type { MeetingDto } from '@njangi/shared/contracts/meetings';
import {
  draftMinutes,
  getMeeting,
  listMeetings,
  requestAgendaItem,
  requestCheckIn,
  requestExcuse,
  requestMarkAttendance,
  requestPublishMinutes,
  requestScheduleMeeting,
} from '../../modules/meetings';
import { agentError } from '../errors';
import type { AgentData, AgentMeetingsPort } from '../ports';
import { resolveMember } from '../tools/resolve-member';
import type { AgentCtx } from '../types';

function groupOf(ctx: AgentCtx): string {
  // Tools check the active group before calling the port (needGroup).
  if (!ctx.groupId) throw new Error('meetings port called without an active group');
  return ctx.groupId;
}

/** The meeting asked for, only if it belongs to the active group; else the next one planned. */
async function meetingOf(ctx: AgentCtx, id: string | undefined): Promise<MeetingDto> {
  const groupId = groupOf(ctx);
  if (id) {
    const meeting = await getMeeting(ctx.userId, id);
    if (meeting.groupId !== groupId) throw agentError('MEETING_NOT_FOUND');
    return meeting;
  }
  const [next] = await listMeetings(ctx.userId, groupId, { when: 'upcoming', limit: 1 });
  if (!next) throw agentError('NO_UPCOMING_MEETING');
  return next;
}

function toAgentMeeting(ctx: AgentCtx, meeting: MeetingDto): AgentData {
  const base = {
    meetingId: meeting.id,
    date: formatDateTime(meeting.scheduledAt, ctx.lang),
    place: meeting.place,
    status: meeting.status,
    agenda: meeting.agenda.map((item) => ({
      text: item.text[ctx.lang],
      ...(item.author ? { addedBy: item.author.name } : {}),
    })),
    attendance: meeting.counts,
    minutes: {
      version: meeting.minutes.version,
      publishedOn: meeting.minutes.publishedAt
        ? formatDateTime(meeting.minutes.publishedAt, ctx.lang)
        : null,
    },
  };
  // In the group chat nobody's own attendance is discussed (spec 4.4).
  if (ctx.channel === 'GROUP') return base;
  return {
    ...base,
    checkInOpen: meeting.checkIn.open,
    me: {
      status: meeting.me.status,
      canCheckIn: meeting.me.canCheckIn,
      canExcuse: meeting.me.canExcuse,
    },
  };
}

export const meetingsAdapter: AgentMeetingsPort = {
  async get(ctx, input) {
    return toAgentMeeting(ctx, await meetingOf(ctx, input.id));
  },

  async prepareAgendaItem(ctx, input) {
    const meeting = await meetingOf(ctx, input.meetingId);
    return requestAgendaItem(ctx.actor, meeting.id, input.text, 'AGENT');
  },

  async prepareCheckIn(ctx, input) {
    const meeting = await meetingOf(ctx, input.meetingId);
    return requestCheckIn(ctx.actor, meeting.id, 'AGENT');
  },

  async prepareExcuse(ctx, input) {
    const meeting = await meetingOf(ctx, input.meetingId);
    return requestExcuse(ctx.actor, meeting.id, input.reason, 'AGENT');
  },

  prepareSchedule(ctx, input) {
    // The member gives a day and a time in Douala (UTC+1, no daylight saving); stored in UTC.
    const scheduledAt = new Date(`${input.date}T${input.time}:00+01:00`).toISOString();
    return requestScheduleMeeting(
      ctx.actor,
      groupOf(ctx),
      { scheduledAt, place: input.place },
      'AGENT',
    );
  },

  async prepareAttendance(ctx, input) {
    const meeting = await meetingOf(ctx, input.meetingId);
    const member = await resolveMember(ctx, groupOf(ctx), input.member);
    if ('outcome' in member) {
      const code = member.outcome.status === 'REFUSED' ? member.outcome.code : 'MEMBER_NOT_FOUND';
      throw agentError(code === 'MEMBER_AMBIGUOUS' ? 'MEMBER_AMBIGUOUS' : 'MEMBER_NOT_FOUND');
    }
    return requestMarkAttendance(
      ctx.actor,
      meeting.id,
      [{ membershipId: member.membershipId, present: input.present }],
      'AGENT',
    );
  },

  async draftMinutes(ctx, input) {
    const meeting = await meetingOf(ctx, input.meetingId);
    const draft = await draftMinutes(ctx.userId, meeting.id, input.notes ?? null);
    return { meetingId: draft.meetingId, draft: draft.text };
  },

  async preparePublish(ctx, input) {
    const meeting = await meetingOf(ctx, input.meetingId);
    return requestPublishMinutes(ctx.actor, meeting.id, { text: input.text }, 'AGENT');
  },
};
