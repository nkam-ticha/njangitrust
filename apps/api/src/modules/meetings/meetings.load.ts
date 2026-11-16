// Loading a meeting for an action: the meeting, then the permission to do `action` in its group.
import type { Db, PrismaClient } from '../../lib/prisma';
import { authorizeGroup, type GroupAccess, type GroupAction } from '../../permissions';
import { meetingError } from './meetings.errors';

/** A stored meeting. */
export type MeetingRow = NonNullable<Awaited<ReturnType<PrismaClient['meeting']['findUnique']>>>;

/** Members who take part in a meeting: active (R12.1: a newcomer's duties start next cycle). */
export const PARTICIPANT_STATUSES = ['ACTIVE', 'LEAVING'] as const;

export async function loadMeeting(
  db: Db,
  userId: string,
  meetingId: string,
  action: GroupAction,
): Promise<{ meeting: MeetingRow; access: GroupAccess }> {
  const meeting = await db.meeting.findUnique({ where: { id: meetingId } });
  if (!meeting) throw meetingError('MEETING_NOT_FOUND');
  const access = await authorizeGroup(userId, meeting.groupId, action, db);
  return { meeting, access };
}

/** The group's participants with their names (never a phone number). */
export function participantsOf(db: Db, groupId: string) {
  return db.membership.findMany({
    where: { groupId, status: { in: [...PARTICIPANT_STATUSES] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, userId: true, user: { select: { name: true, language: true } } },
  });
}

/** `/groups/<id>/meetings/<id>`: where a notification about this meeting opens. */
export const meetingLink = (groupId: string, meetingId: string) =>
  `/groups/${groupId}/meetings/${meetingId}`;
