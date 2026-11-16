// Meetings (spec 2.7 Meetings, R15, FSD MTG-01): scheduling, cancelling, listing and reading. Every
// function acts as the given member, so the agent's tools wrap it unchanged; the admin's changes
// are also PendingAction handlers (meetings.actions.ts). Attendance is in meetings.attendance.ts,
// minutes in meetings.minutes.ts, the generated agenda in meetings.agenda-job.ts.
import type { MeetingDto, ScheduleMeetingRequest } from '@njangi/shared/contracts/meetings';
import { meetingTexts as t } from '@njangi/shared/i18n/server/meetings';
import { clock } from '../../lib/clock';
import { dispatchJob } from '../../jobs/dispatch';
import { getPrisma, type Db } from '../../lib/prisma';
import { bilingual, ui } from '../../lib/texts';
import { authorizeGroup } from '../../permissions';
import { toMeeting } from '../../dto/meetings';
import { audit } from '../audit';
import { postSystemMessage, runScoped, type Scope } from '../chat';
import { meetingError } from './meetings.errors';
import { agendaDueAt, scheduleRefusal } from './meetings.guards';
import { loadMeeting, PARTICIPANT_STATUSES, type MeetingRow } from './meetings.load';
import { dateParam, notifyParticipants } from './meetings.notices';
import { meetingSources } from './meetings.view';

/** R15.1: the admin schedules a meeting; the group is told, and the agenda is planned (R15.2). */
export async function scheduleMeeting(
  userId: string,
  groupId: string,
  input: ScheduleMeetingRequest,
  scope?: Scope,
): Promise<MeetingDto> {
  const scheduledAt = new Date(input.scheduledAt);
  return runScoped(scope, async (s) => {
    const access = await authorizeGroup(userId, groupId, 'group.meetings.schedule', s.db);
    const now = clock.now();
    const refusal = scheduleRefusal(scheduledAt, now);
    if (refusal) throw meetingError(refusal);
    const row = await s.db.meeting.create({
      data: { groupId, scheduledAt, place: input.place },
    });
    const when = dateParam(scheduledAt);
    await postSystemMessage(
      groupId,
      ui((c) => c.chat.system.meetingScheduled, { date: when, place: input.place }),
      s.effects,
      s.db,
    );
    await notifyParticipants(s, {
      groupId,
      meetingId: row.id,
      category: 'GROUP',
      title: bilingual(t.scheduledTitle, { group: access.group.name }),
      body: bilingual(t.scheduledBody, { date: when, place: input.place }),
      exceptMembershipId: access.membership.id,
    });
    await audit(
      { action: 'meeting.scheduled', actorUserId: userId, groupId, target: `Meeting:${row.id}` },
      s.db,
    );
    // R15.2: 24 hours before the start; if that moment has passed, now.
    const due = agendaDueAt(scheduledAt);
    s.effects.add(() =>
      dispatchJob(
        'meetings.agenda',
        { meetingId: row.id },
        { jobId: `agenda-${row.id}`, at: due.getTime() > now.getTime() ? due : now },
      ),
    );
    return viewOf(s.db, row, access.membership.id, true, now);
  });
}

/** The admin cancels a meeting that has not been closed; the group is told. */
export async function cancelMeeting(
  userId: string,
  meetingId: string,
  scope?: Scope,
): Promise<MeetingDto> {
  return runScoped(scope, async (s) => {
    const { meeting, access } = await loadMeeting(
      s.db,
      userId,
      meetingId,
      'group.meetings.schedule',
    );
    if (meeting.status !== 'SCHEDULED') throw meetingError('MEETING_NOT_SCHEDULED');
    const row = await s.db.meeting.update({
      where: { id: meetingId },
      data: { status: 'CANCELLED' },
    });
    await notifyParticipants(s, {
      groupId: meeting.groupId,
      meetingId,
      category: 'GROUP',
      title: bilingual(t.cancelledTitle),
      body: bilingual(t.cancelledBody, {
        group: access.group.name,
        date: dateParam(meeting.scheduledAt),
      }),
      exceptMembershipId: access.membership.id,
    });
    await audit(
      {
        action: 'meeting.cancelled',
        actorUserId: userId,
        groupId: meeting.groupId,
        target: `Meeting:${meetingId}`,
      },
      s.db,
    );
    return viewOf(s.db, row, access.membership.id, true, clock.now());
  });
}

async function viewOf(
  db: Db,
  meeting: MeetingRow,
  membershipId: string,
  participant: boolean,
  now: Date,
): Promise<MeetingDto> {
  const [source] = await meetingSources(db, [meeting], { membershipId, participant }, now);
  return toMeeting(source!);
}

export async function getMeeting(userId: string, meetingId: string): Promise<MeetingDto> {
  const { meeting, access } = await loadMeeting(
    getPrisma(),
    userId,
    meetingId,
    'group.meetings.read',
  );
  const participant = (PARTICIPANT_STATUSES as readonly string[]).includes(
    access.membership.status,
  );
  return viewOf(getPrisma(), meeting, access.membership.id, participant, clock.now());
}

/** `upcoming` (the default): not yet closed or cancelled, soonest first. `past`: newest first. */
export async function listMeetings(
  userId: string,
  groupId: string,
  filter: { when?: 'upcoming' | 'past'; limit?: number } = {},
): Promise<MeetingDto[]> {
  const access = await authorizeGroup(userId, groupId, 'group.meetings.read');
  const prisma = getPrisma();
  const upcoming = (filter.when ?? 'upcoming') === 'upcoming';
  const meetings = await prisma.meeting.findMany({
    where: { groupId, status: upcoming ? 'SCHEDULED' : { not: 'SCHEDULED' } },
    orderBy: { scheduledAt: upcoming ? 'asc' : 'desc' },
    take: filter.limit ?? 20,
  });
  const participant = (PARTICIPANT_STATUSES as readonly string[]).includes(
    access.membership.status,
  );
  const sources = await meetingSources(
    prisma,
    meetings,
    { membershipId: access.membership.id, participant },
    clock.now(),
  );
  return sources.map(toMeeting);
}
