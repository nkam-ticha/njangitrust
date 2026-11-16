// Meeting jobs (spec 2.9 `meeting.agenda`, R15.2, NOT-02): the agenda is generated 24 hours before a
// meeting from what the other modules expose (a job planned when the meeting is scheduled, plus a scan
// every 15 minutes that catches any that was missed), and a reminder goes out shortly before the start.
// Payloads carry ids only.
import { formatClock, type Bilingual } from '@njangi/shared';
import { meetingTexts as t } from '@njangi/shared/i18n/server/meetings';
import { checkInWindow } from '@njangi/rules';
import type { Job } from 'bullmq';
import { clock } from '../../lib/clock';
import { getPrisma, Prisma } from '../../lib/prisma';
import { bilingual, ui } from '../../lib/texts';
import { registerJob, registerRepeatable } from '../../jobs/registry';
import { postSystemMessage, runScoped } from '../chat';
import { registerReminderSource, type NotificationInput } from '../notifications';
import { listProposals } from '../proposals';
import { buildAutoAgenda } from './agenda';
import { agendaDueAt } from './meetings.guards';
import { meetingLink, participantsOf } from './meetings.load';
import { dateParam, notifyParticipants } from './meetings.notices';
import { meetingMoneyPort } from './meetings.ports';

/** R15.2: the reminder goes out when the meeting is at most this many hours away. */
export const REMINDER_HOURS = 2;

const noAgenda = { equals: Prisma.DbNull };

/**
 * R15.2: generates the agenda of one meeting once its time has come (24 h before the start). Safe to
 * call again: only one call writes it. Returns whether this call generated it.
 */
export async function generateAgenda(meetingId: string, now: Date = clock.now()): Promise<boolean> {
  const prisma = getPrisma();
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: { group: { select: { name: true } } },
  });
  if (!meeting || meeting.status !== 'SCHEDULED' || meeting.agenda !== null) return false;
  if (now.getTime() < agendaDueAt(meeting.scheduledAt).getTime()) return false;
  const admin = await prisma.membership.findFirst({
    where: { groupId: meeting.groupId, role: 'ADMIN', status: { in: ['ACTIVE', 'LEAVING'] } },
    select: { userId: true },
  });
  const [money, openVotes, solidarityOpen] = await Promise.all([
    meetingMoneyPort().agendaData(prisma, {
      groupId: meeting.groupId,
      meetingAt: meeting.scheduledAt,
    }),
    admin ? listProposals(admin.userId, meeting.groupId, { status: 'OPEN' }) : Promise.resolve([]),
    prisma.solidarityRequest.count({ where: { groupId: meeting.groupId, status: 'VOTING' } }),
  ]);
  const items = buildAutoAgenda({
    round: money.round,
    unpaidNames: money.unpaidNames,
    openVotes: openVotes.length,
    installmentsDue: money.installmentsDue,
    solidarityOpen,
  });
  return runScoped(undefined, async (s) => {
    const claimed = await s.db.meeting.updateMany({
      where: { id: meetingId, status: 'SCHEDULED', agenda: noAgenda },
      data: {
        agenda: {
          generatedAt: now.toISOString(),
          items: items.map((i) => ({ key: i.key, text: { fr: i.text.fr, en: i.text.en } })),
        },
      },
    });
    if (claimed.count !== 1) return false;
    const day = dateParam(meeting.scheduledAt);
    await postSystemMessage(
      meeting.groupId,
      ui((c) => c.chat.system.agendaReady, { date: day }),
      s.effects,
      s.db,
    );
    await notifyParticipants(s, {
      groupId: meeting.groupId,
      meetingId,
      category: 'GROUP',
      title: bilingual(t.agendaReadyTitle),
      body: bilingual(t.agendaReadyBody, { group: meeting.group.name, date: day }),
    });
    return true;
  });
}

/** The scan: every future meeting whose agenda is due and still missing. Returns how many it made. */
export async function generateDueAgendas(now: Date = clock.now()): Promise<number> {
  const due = await getPrisma().meeting.findMany({
    where: {
      status: 'SCHEDULED',
      agenda: noAgenda,
      scheduledAt: { gt: now, lte: new Date(now.getTime() + 24 * 3_600_000) },
    },
    select: { id: true },
    take: 100,
  });
  let made = 0;
  for (const { id } of due) if (await generateAgenda(id, now)) made += 1;
  return made;
}

const clockParam = (at: Date): Bilingual => ({
  fr: formatClock(at, 'fr'),
  en: formatClock(at, 'en'),
});

/**
 * A reminder source for the hourly `reminders.send` job: members who have not checked in and have not
 * excused themselves are told once, in the last 2 hours before a meeting, that check-in opens.
 */
export async function meetingReminders(now: Date): Promise<NotificationInput[]> {
  const prisma = getPrisma();
  const meetings = await prisma.meeting.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledAt: { gt: now, lte: new Date(now.getTime() + REMINDER_HOURS * 3_600_000) },
    },
    include: { group: { select: { name: true } }, attendances: true },
  });
  const out: NotificationInput[] = [];
  for (const meeting of meetings) {
    const link = meetingLink(meeting.groupId, meeting.id);
    const members = await participantsOf(prisma, meeting.groupId);
    const told = await prisma.notification.findMany({
      where: { groupId: meeting.groupId, deepLink: link, category: 'REMINDERS' },
      select: { userId: true },
    });
    const skip = new Set([
      ...told.map((n) => n.userId),
      ...meeting.attendances.filter((a) => a.present || a.excused).map((a) => a.membershipId),
    ]);
    for (const m of members) {
      if (skip.has(m.userId) || skip.has(m.id)) continue;
      out.push({
        userId: m.userId,
        groupId: meeting.groupId,
        category: 'REMINDERS',
        title: bilingual(t.reminderTitle),
        body: bilingual(t.reminderBody, {
          group: meeting.group.name,
          date: dateParam(meeting.scheduledAt),
          time: clockParam(checkInWindow(meeting.scheduledAt).opensAt),
        }),
        deepLink: link,
      });
    }
  }
  return out;
}

let registered = false;

export function registerMeetingJobs(): void {
  if (registered) return;
  registered = true;
  registerJob({
    name: 'meetings.agenda',
    process: async (job: Job<{ meetingId: string }>) => {
      await generateAgenda(job.data.meetingId);
    },
  });
  registerJob({
    name: 'meetings.agendaScan',
    process: async () => {
      await generateDueAgendas();
    },
  });
  registerRepeatable({
    id: 'meetings.agenda.every15',
    name: 'meetings.agendaScan',
    pattern: '*/15 * * * *',
  });
  registerReminderSource(meetingReminders);
}
