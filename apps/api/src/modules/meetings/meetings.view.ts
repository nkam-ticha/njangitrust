// What a member sees of a meeting: the stored meeting, the attendance and the agenda items, plus what
// the viewer can do now (the same guards the actions use). Built for the dto mapper.
import { checkInWindow, isCheckInOpen } from '@njangi/rules';
import { bilingualSchema } from '@njangi/shared/contracts/common';
import type { AttendanceStatus } from '@njangi/shared/contracts/meetings';
import { z } from 'zod';
import type { MeetingSource } from '../../dto/meetings';
import type { Db } from '../../lib/prisma';
import { checkInRefusal, excuseRefusal } from './meetings.guards';
import type { MeetingRow } from './meetings.load';

const generatedAgendaSchema = z.object({
  generatedAt: z.string(),
  items: z.array(z.object({ key: z.string(), text: bilingualSchema })),
});

/** The generated agenda stored on the meeting; null before it exists (or if it is unreadable). */
export function readGeneratedAgenda(agenda: unknown) {
  const parsed = generatedAgendaSchema.safeParse(agenda);
  return parsed.success ? parsed.data : null;
}

export interface Viewer {
  membershipId: string;
  /** ACTIVE or LEAVING: the member takes part in meetings. */
  participant: boolean;
}

export function attendanceStatus(
  row: { present: boolean; excused: boolean } | undefined,
  held: boolean,
): AttendanceStatus {
  if (row?.present) return 'PRESENT';
  if (row?.excused) return 'EXCUSED';
  return held ? 'ABSENT' : 'UNMARKED';
}

/** The sources for the mapper, with two queries for any number of meetings. */
export async function meetingSources(
  db: Db,
  meetings: readonly MeetingRow[],
  viewer: Viewer,
  now: Date,
): Promise<MeetingSource[]> {
  if (meetings.length === 0) return [];
  const ids = meetings.map((m) => m.id);
  const [items, attendance] = await Promise.all([
    db.agendaItem.findMany({
      where: { meetingId: { in: ids }, source: 'MEMBER' },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        meetingId: true,
        text: true,
        author: { select: { id: true, user: { select: { name: true } } } },
      },
    }),
    db.attendance.findMany({
      where: { meetingId: { in: ids } },
      select: {
        meetingId: true,
        membershipId: true,
        present: true,
        excused: true,
        checkedInAt: true,
      },
    }),
  ]);
  return meetings.map((m) => {
    const rows = attendance.filter((a) => a.meetingId === m.id);
    const mine = rows.find((a) => a.membershipId === viewer.membershipId);
    const held = m.status === 'HELD';
    const window = checkInWindow(m.scheduledAt);
    const generated = readGeneratedAgenda(m.agenda);
    const guardInput = {
      status: m.status,
      scheduledAt: m.scheduledAt,
      now,
      alreadyPresent: mine?.present === true,
    };
    return {
      id: m.id,
      groupId: m.groupId,
      scheduledAt: m.scheduledAt,
      place: m.place,
      status: m.status,
      checkIn: { ...window, open: isCheckInOpen(m.scheduledAt, now) },
      agendaGeneratedAt: generated ? new Date(generated.generatedAt) : null,
      autoItems: generated?.items ?? [],
      memberItems: items.filter((i) => i.meetingId === m.id),
      counts: {
        present: rows.filter((a) => a.present).length,
        excused: rows.filter((a) => a.excused && !a.present).length,
        absent: held ? rows.filter((a) => !a.present && !a.excused).length : null,
      },
      me: {
        status: attendanceStatus(mine, held),
        checkedInAt: mine?.checkedInAt ?? null,
        canCheckIn: viewer.participant && checkInRefusal(guardInput) === null,
        canExcuse: viewer.participant && !mine?.excused && excuseRefusal(guardInput) === null,
      },
      minutes: { version: m.minutesVersion, publishedAt: m.publishedAt },
    };
  });
}
