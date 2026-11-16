// Meeting minutes (spec R15.4, FSD MTG-01). The admin asks for a draft (L0: nothing is published), edits
// it, and publishes: published minutes never change, a correction is a new version with a reason, and
// each publication is a ledger EVENT carrying the minutes' hash. The draft is built in code from the
// agenda, the attendance, the votes, the payments and the events of the meeting, plus the admin's notes.
import { sumFcfa } from '@njangi/rules';
import type { Lang } from '@njangi/shared';
import type { MinutesVersionDto, PublishMinutesRequest } from '@njangi/shared/contracts/meetings';
import { meetingTexts as t } from '@njangi/shared/i18n/server/meetings';
import { z } from 'zod';
import { clock } from '../../lib/clock';
import { getPrisma, type Db } from '../../lib/prisma';
import { bilingual, ui } from '../../lib/texts';
import { toMinutesVersion } from '../../dto/meetings';
import { audit } from '../audit';
import { postSystemMessage, runScoped, type Scope } from '../chat';
import { listProposals } from '../proposals';
import { meetingError } from './meetings.errors';
import { draftRefusal, MINUTES_WINDOW_HOURS, publishRefusal } from './meetings.guards';
import { recordMinutesPublished } from './meetings.ledger';
import { loadMeeting, PARTICIPANT_STATUSES, type MeetingRow } from './meetings.load';
import { dateParam, notifyParticipants } from './meetings.notices';
import { attendanceStatus, readGeneratedAgenda } from './meetings.view';
import { buildMinutesDraft } from './minutes-draft';
import { appendVersion, minutesHash, readVersions } from './minutes-store';

const partsSchema = z.array(z.object({ amount: z.number().int() }));

/** Payments received in the meeting window: how many, and the francs received in all. */
async function paymentsIn(db: Db, groupId: string, from: Date, to: Date) {
  const rows = await db.ledgerTransaction.findMany({
    where: { groupId, type: 'PAYMENT_RECEIVED', occurredAt: { gte: from, lt: to } },
    select: { metadata: true },
  });
  const totals = rows.map((r) => {
    const parts = partsSchema.safeParse((r.metadata as { parts?: unknown } | null)?.parts);
    return parts.success ? sumFcfa(parts.data.map((p) => p.amount)) : 0;
  });
  return { count: rows.length, totalFcfa: sumFcfa(totals) };
}

/** Ledger EVENTs of the window other than votes (covered apart) and minutes. */
async function eventsIn(db: Db, groupId: string, from: Date, to: Date) {
  const rows = await db.ledgerTransaction.findMany({
    where: { groupId, type: 'EVENT', occurredAt: { gte: from, lt: to } },
    orderBy: { seq: 'asc' },
    take: 40,
    select: { descriptionFr: true, descriptionEn: true, metadata: true },
  });
  return rows
    .filter(
      (r) =>
        !['VOTE_CLOSED', 'MINUTES_PUBLISHED'].includes(
          String((r.metadata as { event?: unknown } | null)?.event),
        ),
    )
    .map((r) => ({ fr: r.descriptionFr, en: r.descriptionEn }));
}

async function draftInput(userId: string, meeting: MeetingRow, lang: Lang, notes: string | null) {
  const prisma = getPrisma();
  const from = meeting.scheduledAt;
  const to = new Date(from.getTime() + MINUTES_WINDOW_HOURS * 3_600_000);
  const [members, attendance, items, payments, events, closed, next] = await Promise.all([
    prisma.membership.findMany({
      where: { groupId: meeting.groupId, status: { in: [...PARTICIPANT_STATUSES] } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, user: { select: { name: true } } },
    }),
    prisma.attendance.findMany({ where: { meetingId: meeting.id } }),
    prisma.agendaItem.findMany({
      where: { meetingId: meeting.id, source: 'MEMBER' },
      orderBy: { createdAt: 'asc' },
      select: { text: true, author: { select: { user: { select: { name: true } } } } },
    }),
    paymentsIn(prisma, meeting.groupId, from, to),
    eventsIn(prisma, meeting.groupId, from, to),
    listProposals(userId, meeting.groupId, { status: 'CLOSED' }),
    prisma.meeting.findFirst({
      where: {
        groupId: meeting.groupId,
        status: 'SCHEDULED',
        scheduledAt: { gt: meeting.scheduledAt },
      },
      orderBy: { scheduledAt: 'asc' },
      select: { scheduledAt: true, place: true },
    }),
  ]);
  const held = meeting.status === 'HELD';
  const named = (status: 'PRESENT' | 'EXCUSED' | 'ABSENT' | 'UNMARKED') =>
    members
      .filter(
        (m) =>
          attendanceStatus(
            attendance.find((a) => a.membershipId === m.id),
            held,
          ) === status,
      )
      .map((m) => m.user.name);
  const votes = closed
    .filter((v) => v.proposal.closedAt && v.proposal.closedAt >= from && v.proposal.closedAt < to)
    .filter((v) => v.proposal.status !== 'OPEN')
    .map((v) => ({
      title: v.title,
      status: v.proposal.status as 'PASSED' | 'REJECTED' | 'EXPIRED',
      yes: v.proposal.yesCount,
      no: v.proposal.noCount,
    }));
  return {
    lang,
    scheduledAt: meeting.scheduledAt,
    place: meeting.place,
    present: named('PRESENT'),
    excused: named('EXCUSED'),
    // Before the meeting is closed nobody is marked absent yet: those not checked in are listed as such.
    absent: [...named('ABSENT'), ...named('UNMARKED')],
    agendaLines: readGeneratedAgenda(meeting.agenda)?.items.map((i) => i.text) ?? [],
    memberItems: items.map((i) => ({ text: i.text, author: i.author?.user.name ?? '' })),
    payments,
    votes,
    events,
    nextMeeting: next,
    notes,
  };
}

/** R15.4, L0: a deterministic draft for the admin to edit. Nothing is published. */
export async function draftMinutes(
  userId: string,
  meetingId: string,
  notes: string | null,
): Promise<{ meetingId: string; language: Lang; text: string; generatedAt: Date }> {
  const prisma = getPrisma();
  const { meeting } = await loadMeeting(prisma, userId, meetingId, 'group.minutes.draft');
  const now = clock.now();
  const refusal = draftRefusal({ status: meeting.status, scheduledAt: meeting.scheduledAt, now });
  if (refusal) throw meetingError(refusal);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { language: true },
  });
  const text = buildMinutesDraft(await draftInput(userId, meeting, user.language, notes));
  await prisma.meeting.update({ where: { id: meetingId }, data: { minutesDraft: text } });
  return { meetingId, language: user.language, text, generatedAt: now };
}

/** R15.4: publishes version 1, or a correction (a new version, with a reason, never an edit). */
export async function publishMinutes(
  userId: string,
  meetingId: string,
  input: PublishMinutesRequest,
  scope?: Scope,
): Promise<MinutesVersionDto> {
  return runScoped(scope, async (s) => {
    const { meeting, access } = await loadMeeting(s.db, userId, meetingId, 'group.minutes.publish');
    const versions = readVersions(meeting.minutesPublished);
    const refusal = publishRefusal({
      status: meeting.status,
      latestText: versions.at(-1)?.text ?? null,
      text: input.text,
      reason: input.reason ?? null,
    });
    if (refusal) throw meetingError(refusal);
    const now = clock.now();
    const version = versions.length + 1;
    const correctionReason = version === 1 ? null : (input.reason ?? null);
    const publishedAt = now.toISOString();
    const hash = minutesHash({
      meetingId,
      version,
      text: input.text,
      correctionReason,
      publishedAt,
    });
    const entry = {
      version,
      text: input.text,
      correctionReason,
      publishedAt,
      publishedByMembershipId: access.membership.id,
      hash,
    };
    // Two admins' clicks cannot both publish the same version number.
    const written = await s.db.meeting.updateMany({
      where: { id: meetingId, minutesVersion: versions.length },
      data: {
        minutesPublished: appendVersion(meeting.minutesPublished, entry),
        minutesVersion: version,
        publishedAt: now,
        minutesDraft: null,
      },
    });
    if (written.count !== 1) throw meetingError('MINUTES_UNCHANGED');
    const day = dateParam(meeting.scheduledAt);
    const corrected = version > 1;
    await recordMinutesPublished(s.db, {
      groupId: meeting.groupId,
      meetingId,
      version,
      minutesHash: hash,
      publishedByMembershipId: access.membership.id,
      occurredAt: now,
      description: corrected
        ? ui((c) => c.chat.system.minutesCorrected, { version, date: day })
        : ui((c) => c.chat.system.minutesPublished, { date: day }),
    });
    await postSystemMessage(
      meeting.groupId,
      corrected
        ? ui((c) => c.chat.system.minutesCorrected, { version, date: day })
        : ui((c) => c.chat.system.minutesPublished, { date: day }),
      s.effects,
      s.db,
    );
    await notifyParticipants(s, {
      groupId: meeting.groupId,
      meetingId,
      category: 'GROUP',
      title: corrected ? bilingual(t.minutesCorrectedTitle) : bilingual(t.minutesPublishedTitle),
      body: bilingual(t.minutesBody, { group: access.group.name, date: day }),
      exceptMembershipId: access.membership.id,
    });
    await audit(
      {
        action: 'meeting.minutes.published',
        actorUserId: userId,
        groupId: meeting.groupId,
        target: `Meeting:${meetingId}`,
        details: { version, hash },
      },
      s.db,
    );
    const publisher = await s.db.membership.findUniqueOrThrow({
      where: { id: access.membership.id },
      select: { id: true, user: { select: { name: true } } },
    });
    return toMinutesVersion({ ...entry, publishedBy: publisher });
  });
}

/** Every published version, newest first. Readers of the group see them; nobody sees a draft. */
export async function listMinutes(userId: string, meetingId: string): Promise<MinutesVersionDto[]> {
  const prisma = getPrisma();
  const { meeting } = await loadMeeting(prisma, userId, meetingId, 'group.meetings.read');
  const versions = readVersions(meeting.minutesPublished);
  const people = await prisma.membership.findMany({
    where: { id: { in: [...new Set(versions.map((v) => v.publishedByMembershipId))] } },
    select: { id: true, user: { select: { name: true } } },
  });
  return versions
    .map((v) =>
      toMinutesVersion({
        ...v,
        publishedBy: people.find((p) => p.id === v.publishedByMembershipId) ?? {
          id: v.publishedByMembershipId,
          user: { name: '' },
        },
      }),
    )
    .reverse();
}
