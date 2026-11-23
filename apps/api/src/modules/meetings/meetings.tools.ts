// Agent tools for the meetings the member can see or the admin can cancel and close (spec 4.6,
// R15). Same services as the routes: the list is GET /groups/:id/meetings, and the two admin tools
// prepare the MEETING_CANCEL and MEETING_CLOSE cards the admin confirms in the app. The other
// meeting tools go through the agent's meetings port (agent/adapters/meetings.ts).
import { formatDateTime } from '@njangi/shared';
import type { MeetingDto } from '@njangi/shared/contracts/meetings';
import { agentError } from '../../agent/errors';
import { ok, prepared } from '../../agent/tools/outcomes';
import { needGroup, serviceActor } from '../../agent/tools/resolve-group';
import { SPECS } from '../../agent/tools/specs';
import { implement, type ToolOutcome } from '../../agent/tools/types';
import type { AgentCtx } from '../../agent/types';
import { clock } from '../../lib/clock';
import { requestCancelMeeting, requestCloseMeeting } from './meetings.actions';
import { getMeeting, listMeetings } from './meetings.service';

/** The meeting asked for (it must belong to the active group), else the first scheduled one. */
async function pick(
  ctx: AgentCtx,
  id: string | undefined,
  choose: (scheduled: MeetingDto[]) => MeetingDto | undefined,
): Promise<string> {
  if (id) {
    const meeting = await getMeeting(ctx.userId, id);
    if (meeting.groupId !== ctx.groupId) throw agentError('MEETING_NOT_FOUND');
    return meeting.id;
  }
  const scheduled = await listMeetings(ctx.userId, ctx.groupId!, { when: 'upcoming', limit: 20 });
  const meeting = choose(scheduled);
  if (!meeting) throw agentError('NO_UPCOMING_MEETING');
  return meeting.id;
}

export const meetingsModuleTools = [
  implement(SPECS.list_meetings, async (ctx, a): Promise<ToolOutcome> => {
    const noGroup = needGroup(ctx);
    if (noGroup) return noGroup;
    const meetings = await listMeetings(ctx.userId, ctx.groupId!, {
      when: a.when ?? 'upcoming',
      limit: 10,
    });
    return ok({
      meetings: meetings.map((m) => ({
        meetingId: m.id,
        date: formatDateTime(m.scheduledAt, ctx.lang),
        place: m.place,
        status: m.status,
      })),
    });
  }),
  implement(SPECS.cancel_meeting, async (ctx, a): Promise<ToolOutcome> => {
    const noGroup = needGroup(ctx);
    if (noGroup) return noGroup;
    const id = await pick(ctx, a.meetingId, (scheduled) => scheduled[0]);
    return prepared(await requestCancelMeeting(serviceActor(ctx), id, 'AGENT'), ctx.lang);
  }),
  implement(SPECS.close_meeting, async (ctx, a): Promise<ToolOutcome> => {
    const noGroup = needGroup(ctx);
    if (noGroup) return noGroup;
    const now = clock.nowMs();
    // The latest scheduled meeting whose time has passed: the one that just took place.
    const id = await pick(ctx, a.meetingId, (scheduled) =>
      [...scheduled].reverse().find((m) => new Date(m.scheduledAt).getTime() <= now),
    );
    return prepared(await requestCloseMeeting(serviceActor(ctx), id, 'AGENT'), ctx.lang);
  }),
];
