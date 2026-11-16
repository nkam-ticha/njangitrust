// Attendance, excuses, agenda items and closing (spec R15.3, R15.5, R6.3). A member checks in from 1 h
// before to 2 h after the start, or the admin marks them; an excuse counts only before the start; the
// admin closes the meeting, which freezes attendance and, if the group's rule asks for it, assesses
// the absence fine through the money port. Every function acts as the given member.
import { absenceFines } from '@njangi/rules';
import type {
  AttendanceRowDto,
  MarkAttendanceRequest,
  MeetingDto,
} from '@njangi/shared/contracts/meetings';
import { clock } from '../../lib/clock';
import { getPrisma, type Db } from '../../lib/prisma';
import { toAttendanceRow, toMeeting } from '../../dto/meetings';
import { audit } from '../audit';
import { runScoped, type Scope } from '../chat';
import { getCurrentParams } from '../rulesets';
import { meetingError } from './meetings.errors';
import {
  agendaItemRefusal,
  checkInRefusal,
  closeRefusal,
  excuseRefusal,
  markRefusal,
} from './meetings.guards';
import {
  loadMeeting,
  participantsOf,
  PARTICIPANT_STATUSES,
  type MeetingRow,
} from './meetings.load';
import { absenceFinesPort } from './meetings.ports';
import { attendanceStatus, meetingSources } from './meetings.view';

async function viewOf(
  db: Db,
  meeting: MeetingRow,
  membershipId: string,
  now: Date,
): Promise<MeetingDto> {
  const [source] = await meetingSources(db, [meeting], { membershipId, participant: true }, now);
  return toMeeting(source!);
}

const key = (meetingId: string, membershipId: string) => ({
  meetingId_membershipId: { meetingId, membershipId },
});

/** R15.3: the member checks in themself. */
export async function checkIn(
  userId: string,
  meetingId: string,
  scope?: Scope,
): Promise<MeetingDto> {
  return runScoped(scope, async (s) => {
    const { meeting, access } = await loadMeeting(
      s.db,
      userId,
      meetingId,
      'group.meetings.checkIn',
    );
    const me = access.membership.id;
    const existing = await s.db.attendance.findUnique({ where: key(meetingId, me) });
    const now = clock.now();
    const refusal = checkInRefusal({
      status: meeting.status,
      scheduledAt: meeting.scheduledAt,
      now,
      alreadyPresent: existing?.present === true,
    });
    if (refusal) throw meetingError(refusal);
    await s.db.attendance.upsert({
      where: key(meetingId, me),
      create: { meetingId, membershipId: me, present: true, checkedInAt: now },
      update: { present: true, checkedInAt: now, markedByMembershipId: null },
    });
    return viewOf(s.db, meeting, me, now);
  });
}

/** R15.3, R6.3: an excuse sent before the start spares the absence fine. */
export async function sendExcuse(
  userId: string,
  meetingId: string,
  reason: string,
  scope?: Scope,
): Promise<MeetingDto> {
  return runScoped(scope, async (s) => {
    const { meeting, access } = await loadMeeting(s.db, userId, meetingId, 'group.meetings.excuse');
    const me = access.membership.id;
    const existing = await s.db.attendance.findUnique({ where: key(meetingId, me) });
    const now = clock.now();
    const refusal = excuseRefusal({
      status: meeting.status,
      scheduledAt: meeting.scheduledAt,
      now,
      alreadyPresent: existing?.present === true,
    });
    if (refusal) throw meetingError(refusal);
    await s.db.attendance.upsert({
      where: key(meetingId, me),
      create: { meetingId, membershipId: me, excused: true, excuseReason: reason },
      update: { excused: true, excuseReason: reason },
    });
    return viewOf(s.db, meeting, me, now);
  });
}

/** R15.2: a member adds an item to the agenda until the meeting starts. */
export async function addAgendaItem(
  userId: string,
  meetingId: string,
  text: string,
  scope?: Scope,
): Promise<MeetingDto> {
  return runScoped(scope, async (s) => {
    const { meeting, access } = await loadMeeting(
      s.db,
      userId,
      meetingId,
      'group.meetings.agendaAdd',
    );
    const now = clock.now();
    const refusal = agendaItemRefusal({
      status: meeting.status,
      scheduledAt: meeting.scheduledAt,
      now,
      memberItems: await s.db.agendaItem.count({ where: { meetingId, source: 'MEMBER' } }),
    });
    if (refusal) throw meetingError(refusal);
    await s.db.agendaItem.create({
      data: { meetingId, authorMembershipId: access.membership.id, text, source: 'MEMBER' },
    });
    return viewOf(s.db, meeting, access.membership.id, now);
  });
}

/** R15.3: the admin marks several members present or absent. */
export async function markAttendance(
  userId: string,
  meetingId: string,
  request: MarkAttendanceRequest,
  scope?: Scope,
): Promise<MeetingDto> {
  return runScoped(scope, async (s) => {
    const { meeting, access } = await loadMeeting(
      s.db,
      userId,
      meetingId,
      'group.meetings.attendanceMark',
    );
    const now = clock.now();
    const refusal = markRefusal({ status: meeting.status, scheduledAt: meeting.scheduledAt, now });
    if (refusal) throw meetingError(refusal);
    const ids = new Set(request.marks.map((m) => m.membershipId));
    const valid = await s.db.membership.count({
      where: {
        id: { in: [...ids] },
        groupId: meeting.groupId,
        status: { in: [...PARTICIPANT_STATUSES] },
      },
    });
    if (valid !== ids.size) throw meetingError('NOT_A_PARTICIPANT');
    for (const mark of request.marks) {
      await s.db.attendance.upsert({
        where: key(meetingId, mark.membershipId),
        create: {
          meetingId,
          membershipId: mark.membershipId,
          present: mark.present,
          checkedInAt: mark.present ? now : null,
          markedByMembershipId: access.membership.id,
        },
        update: {
          present: mark.present,
          checkedInAt: mark.present ? now : null,
          markedByMembershipId: access.membership.id,
        },
      });
    }
    await audit(
      {
        action: 'meeting.attendance.marked',
        actorUserId: userId,
        groupId: meeting.groupId,
        target: `Meeting:${meetingId}`,
        details: { marks: request.marks.length },
      },
      s.db,
    );
    return viewOf(s.db, meeting, access.membership.id, now);
  });
}

/** What closing would do: who is absent and who would be fined, without changing anything (R6.3). */
export async function planClose(db: Db, meeting: MeetingRow) {
  const members = await participantsOf(db, meeting.groupId);
  const rows = await db.attendance.findMany({ where: { meetingId: meeting.id } });
  const byMember = new Map(rows.map((r) => [r.membershipId, r]));
  const params = await getCurrentParams(meeting.groupId, db);
  const fines = absenceFines({
    meetingAbsenceFine: params.meetingAbsenceFine,
    startsAt: meeting.scheduledAt,
    attendance: members.map((m) => {
      const row = byMember.get(m.id);
      // An excuse is only accepted before the start, so its row dates from before it (R15.3).
      return {
        membershipId: m.id,
        present: row?.present === true,
        excuseSentAt: row?.excused ? row.createdAt : null,
      };
    }),
  });
  return {
    members,
    byMember,
    fines,
    fineAmount: params.meetingAbsenceFine,
    present: members.filter((m) => byMember.get(m.id)?.present === true).length,
    absent: members.filter((m) => byMember.get(m.id)?.present !== true).length,
  };
}

export interface CloseResult {
  meeting: MeetingDto;
  absent: number;
  /** Members fined for an absence without an excuse sent before the start (R6.3). */
  fined: number;
  fineAmount: number;
}

/**
 * R6.3, R15.5: closing freezes attendance (members not checked in are absent) and assesses the
 * absence fine, when the rule is on, for the absent members without an excuse sent before the start.
 */
export async function closeMeeting(
  userId: string,
  meetingId: string,
  scope?: Scope,
): Promise<CloseResult> {
  return runScoped(scope, async (s) => {
    const { meeting, access } = await loadMeeting(
      s.db,
      userId,
      meetingId,
      'group.meetings.attendanceMark',
    );
    const now = clock.now();
    const refusal = closeRefusal({ status: meeting.status, scheduledAt: meeting.scheduledAt, now });
    if (refusal) throw meetingError(refusal);
    const plan = await planClose(s.db, meeting);
    const missing = plan.members.filter((m) => !plan.byMember.has(m.id));
    if (missing.length > 0) {
      await s.db.attendance.createMany({
        data: missing.map((m) => ({ meetingId, membershipId: m.id, present: false })),
      });
    }
    if (plan.fines.length > 0) {
      await absenceFinesPort().assessAbsenceFines(s.db, {
        groupId: meeting.groupId,
        meetingId,
        amount: plan.fineAmount,
        membershipIds: plan.fines.map((f) => f.membershipId),
        occurredAt: now,
      });
    }
    const held = await s.db.meeting.update({ where: { id: meetingId }, data: { status: 'HELD' } });
    await audit(
      {
        action: 'meeting.closed',
        actorUserId: userId,
        groupId: meeting.groupId,
        target: `Meeting:${meetingId}`,
        details: { absent: plan.absent, fined: plan.fines.length },
      },
      s.db,
    );
    return {
      meeting: await viewOf(s.db, held, access.membership.id, now),
      absent: plan.absent,
      fined: plan.fines.length,
      fineAmount: plan.fineAmount,
    };
  });
}

/** Attendance of every participant. The reason of an excuse is for the admin and the member only. */
export async function listAttendance(
  userId: string,
  meetingId: string,
): Promise<AttendanceRowDto[]> {
  const prisma = getPrisma();
  const { meeting, access } = await loadMeeting(prisma, userId, meetingId, 'group.meetings.read');
  const [members, rows] = await Promise.all([
    prisma.membership.findMany({
      where: { groupId: meeting.groupId, status: { in: [...PARTICIPANT_STATUSES] } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, user: { select: { name: true } } },
    }),
    prisma.attendance.findMany({ where: { meetingId } }),
  ]);
  const held = meeting.status === 'HELD';
  return members.map((m) => {
    const row = rows.find((r) => r.membershipId === m.id);
    return toAttendanceRow(
      {
        member: m,
        status: attendanceStatus(row, held),
        checkedInAt: row?.checkedInAt ?? null,
        markedByAdmin: row?.markedByMembershipId != null,
        excuseReason: row?.excuseReason ?? null,
      },
      access.membership.role === 'ADMIN' || m.id === access.membership.id,
    );
  });
}
