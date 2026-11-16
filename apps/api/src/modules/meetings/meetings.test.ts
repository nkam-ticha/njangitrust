// Meetings (spec 2.7 Meetings, R15.1 to R15.3): scheduling, the generated agenda, items added by
// members, check-in and excuses, the admin's marks, and who may do what.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { meetingListSchema, meetingResponseSchema } from '@njangi/shared/contracts/meetings';
import { useJobScheduler } from '../../jobs/dispatch';
import { getPrisma } from '../../lib/prisma';
import { chatWorld, type ChatWorld } from '../../../test/helpers/chat-world';
import type { TestUser } from '../../../test/helpers/client';
import { installFakeMoney } from '../../../test/helpers/fake-money-port';
import { propose } from '../../../test/helpers/governance';
import {
  insertMeeting,
  installFakeMeetingMoney,
  type FakeMeetingMoney,
} from '../../../test/helpers/meeting-helpers';
import { confirmCard, stageApi } from '../../../test/helpers/stage-client';
import { generateAgenda, generateDueAgendas } from './meetings.jobs';

let w: ChatWorld;
let money: FakeMeetingMoney;
beforeAll(async () => {
  w = await chatWorld();
  installFakeMoney();
  money = installFakeMeetingMoney();
});
afterEach(() => {
  useJobScheduler(null);
});

const minutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
const schedule = (body: Record<string, unknown>, user: TestUser = w.admin) =>
  stageApi(user).post(`/v1/groups/${w.groupId}/meetings`, body);
const meetingOf = async (user: TestUser, id: string) =>
  meetingResponseSchema.parse((await stageApi(user).get(`/v1/meetings/${id}`)).body).meeting;
const act = (user: TestUser, id: string, path: string, body?: unknown) =>
  stageApi(user).post(`/v1/meetings/${id}/${path}`, body);

describe('scheduling a meeting (R15.1)', () => {
  it('is a card for the admin; confirmed, the group is told and the agenda is planned for 24 h before', async () => {
    const jobs: { name: string; data: Record<string, unknown>; at: Date; jobId: string }[] = [];
    useJobScheduler((name, data, at, jobId) => {
      jobs.push({ name, data, at, jobId });
      return Promise.resolve();
    });
    const when = minutes(3 * 24 * 60);
    const card = await schedule({ scheduledAt: when, place: 'Chez Carine, Bonamoussadi' });
    expect(card.status).toBe(201);
    expect(card.body.action).toMatchObject({
      type: 'MEETING_SCHEDULE',
      level: 'L1',
      status: 'PENDING',
    });
    expect(await getPrisma().meeting.count({ where: { groupId: w.groupId } })).toBe(0);

    const done = await confirmCard(w.admin, card.body.action.id);
    expect(done.status).toBe(200);
    const id = done.body.action.result.ref as string;
    const meeting = await meetingOf(w.bea, id);
    expect(meeting).toMatchObject({
      status: 'SCHEDULED',
      place: 'Chez Carine, Bonamoussadi',
      agendaGeneratedAt: null,
      agenda: [],
    });
    expect(meeting.checkIn.open).toBe(false);
    expect(jobs.filter((j) => j.name === 'meetings.agenda')).toEqual([
      expect.objectContaining({
        name: 'meetings.agenda',
        data: { meetingId: id },
        jobId: `agenda-${id}`,
        at: new Date(new Date(when).getTime() - 24 * 3_600_000),
      }),
    ]);
    const notices = await getPrisma().notification.findMany({
      where: { groupId: w.groupId, deepLink: `/groups/${w.groupId}/meetings/${id}` },
    });
    expect(notices.map((n) => n.userId).sort()).toEqual([w.bea.id, w.carl.id, w.dina.id].sort());
    expect(notices[0]).toMatchObject({ category: 'GROUP' });
    const system = await getPrisma().message.findFirstOrThrow({
      where: { groupId: w.groupId, kind: 'SYSTEM' },
      orderBy: { createdAt: 'desc' },
    });
    expect(system.systemText).toMatchObject({ fr: expect.stringContaining('Réunion prévue') });
  });

  it('generates the agenda at once when the meeting is less than 24 hours away', async () => {
    const card = await schedule({ scheduledAt: minutes(5 * 60), place: 'En ligne' });
    const done = await confirmCard(w.admin, card.body.action.id);
    const meeting = await meetingOf(w.carl, done.body.action.result.ref);
    expect(meeting.agendaGeneratedAt).not.toBeNull();
  });

  it('refuses a past date, a date beyond a year, a phone number in the place, and non-admins', async () => {
    expect((await schedule({ scheduledAt: minutes(-60), place: 'Ici' })).body.code).toBe(
      'MEETING_IN_THE_PAST',
    );
    expect((await schedule({ scheduledAt: minutes(400 * 24 * 60), place: 'Ici' })).body.code).toBe(
      'MEETING_TOO_FAR',
    );
    expect(
      (await schedule({ scheduledAt: minutes(600), place: 'Appelle le 677 12 34 56' })).status,
    ).toBe(400);
    expect((await schedule({ scheduledAt: minutes(600) })).status).toBe(400);
    const member = await schedule({ scheduledAt: minutes(600), place: 'Ici' }, w.bea);
    expect(member.status).toBe(403);
    expect(member.body.code).toBe('ADMIN_ONLY');
    expect((await schedule({ scheduledAt: minutes(600), place: 'Ici' }, w.stranger)).status).toBe(
      404,
    );
  });

  it('lists upcoming and past meetings and shows the viewer what they can do', async () => {
    const past = await insertMeeting(w.groupId, -600);
    await getPrisma().meeting.update({ where: { id: past }, data: { status: 'HELD' } });
    const upcoming = await stageApi(w.bea).get(`/v1/groups/${w.groupId}/meetings`);
    const list = meetingListSchema.parse(upcoming.body).meetings;
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((m) => m.status === 'SCHEDULED')).toBe(true);
    expect(list.map((m) => m.scheduledAt)).toEqual([...list.map((m) => m.scheduledAt)].sort());
    const pastList = meetingListSchema.parse(
      (await stageApi(w.bea).get(`/v1/groups/${w.groupId}/meetings?when=past`)).body,
    ).meetings;
    expect(pastList.map((m) => m.id)).toContain(past);
    expect(pastList[0]!.me.status).toBe('ABSENT');
  });

  it('cancels a meeting with a card and tells the group', async () => {
    const id = await insertMeeting(w.groupId, 120);
    const card = await act(w.admin, id, 'cancel');
    expect(card.body.action.type).toBe('MEETING_CANCEL');
    expect((await confirmCard(w.admin, card.body.action.id)).status).toBe(200);
    expect((await meetingOf(w.bea, id)).status).toBe('CANCELLED');
    const again = await act(w.admin, id, 'cancel');
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('MEETING_NOT_SCHEDULED');
    const asMember = await act(w.bea, id, 'cancel');
    expect(asMember.status).toBe(403);
  });
});

describe('the generated agenda (R15.2)', () => {
  it('collects what the other modules expose: round, unpaid members, open votes, installments, solidarity', async () => {
    money.agenda = {
      round: { number: 4, beneficiaryName: 'Carine Fotso', paidCount: 2, memberCount: 4 },
      unpaidNames: ['Joël Ndi', 'Paul Mbarga'],
      installmentsDue: 2,
    };
    await propose(w.bea, w.groupId, { type: 'RULE_CHANGE', changes: { lateFine: 1_500 } });
    await getPrisma().solidarityRequest.create({
      data: {
        groupId: w.groupId,
        requesterMembershipId: w.bea.membershipId,
        recipientMembershipId: w.carl.membershipId,
        event: 'NAISSANCE',
        amount: 10_000,
        status: 'VOTING',
      },
    });
    const id = await insertMeeting(w.groupId, 20 * 60);
    await act(w.carl, id, 'agenda-items', { text: 'Acheter des chaises' });

    expect(await generateAgenda(id, new Date())).toBe(true);
    const meeting = await meetingOf(w.dina, id);
    const auto = meeting.agenda.filter((i) => i.source === 'AUTO');
    expect(auto.map((i) => i.id)).toEqual([
      'auto:round',
      'auto:unpaid',
      'auto:votes',
      'auto:installments',
      'auto:solidarity',
    ]);
    expect(auto[0]!.text.en).toContain('Carine Fotso');
    expect(auto[1]!.text.fr).toContain('Joël Ndi, Paul Mbarga');
    expect(auto[2]!.text.en).toBe('1 open vote');
    const member = meeting.agenda.find((i) => i.source === 'MEMBER')!;
    expect(member).toMatchObject({
      text: { fr: 'Acheter des chaises' },
      author: { membershipId: w.carl.membershipId },
    });
    expect(meeting.agendaGeneratedAt).not.toBeNull();
    // Written once: a second call does nothing, and the group is told once.
    expect(await generateAgenda(id, new Date())).toBe(false);
    const notices = await getPrisma().notification.count({
      where: { userId: w.dina.id, deepLink: `/groups/${w.groupId}/meetings/${id}` },
    });
    expect(notices).toBe(1);
  });

  it('is not generated before its time, and the scan catches meetings whose job was missed', async () => {
    const far = await insertMeeting(w.groupId, 3 * 24 * 60);
    const near = await insertMeeting(w.groupId, 10 * 60);
    expect(await generateAgenda(far, new Date())).toBe(false);
    expect(await generateDueAgendas(new Date())).toBeGreaterThanOrEqual(1);
    const prisma = getPrisma();
    expect((await prisma.meeting.findUniqueOrThrow({ where: { id: near } })).agenda).not.toBeNull();
    expect((await prisma.meeting.findUniqueOrThrow({ where: { id: far } })).agenda).toBeNull();
  });
});

describe('items added by members (R15.2)', () => {
  it('are accepted until the meeting starts, at most 30', async () => {
    const id = await insertMeeting(w.groupId, 60);
    const ok = await act(w.bea, id, 'agenda-items', { text: 'La caisse de secours' });
    expect(ok.status).toBe(201);
    expect(meetingResponseSchema.parse(ok.body).meeting.agenda).toHaveLength(1);
    const prisma = getPrisma();
    await prisma.agendaItem.createMany({
      data: Array.from({ length: 29 }, (_, i) => ({
        meetingId: id,
        authorMembershipId: w.bea.membershipId,
        text: `Point ${i}`,
        source: 'MEMBER' as const,
      })),
    });
    const full = await act(w.bea, id, 'agenda-items', { text: 'Un de trop' });
    expect(full.body.code).toBe('AGENDA_FULL');
    const started = await insertMeeting(w.groupId, -10);
    expect((await act(w.bea, started, 'agenda-items', { text: 'Trop tard' })).body.code).toBe(
      'AGENDA_CLOSED',
    );
  });
});

describe('check-in and excuses (R15.3)', () => {
  it('lets a member check in from 1 hour before the start, once', async () => {
    const id = await insertMeeting(w.groupId, 30);
    const res = await act(w.bea, id, 'check-in');
    expect(res.status).toBe(200);
    const meeting = meetingResponseSchema.parse(res.body).meeting;
    expect(meeting.me).toMatchObject({ status: 'PRESENT', canCheckIn: false });
    expect(meeting.counts.present).toBe(1);
    expect((await act(w.bea, id, 'check-in')).body.code).toBe('ALREADY_CHECKED_IN');
  });

  it('is not open more than an hour before, and closed two hours after the start', async () => {
    const early = await insertMeeting(w.groupId, 3 * 60);
    const refused = await act(w.bea, early, 'check-in');
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('CHECK_IN_NOT_OPEN_YET');
    expect((await meetingOf(w.bea, early)).me.canCheckIn).toBe(false);
    const late = await insertMeeting(w.groupId, -3 * 60);
    expect((await act(w.bea, late, 'check-in')).body.code).toBe('CHECK_IN_CLOSED');
  });

  it('takes an excuse before the start only, and keeps its reason for the admin and the member', async () => {
    const id = await insertMeeting(w.groupId, 45);
    expect((await act(w.carl, id, 'excuse', { reason: 'Je suis en voyage' })).status).toBe(200);
    const asMember = await stageApi(w.dina).get(`/v1/meetings/${id}/attendance`);
    const carl = (
      asMember.body.attendance as {
        member: { membershipId: string };
        status: string;
        excuseReason: string | null;
      }[]
    ).find((r) => r.member.membershipId === w.carl.membershipId)!;
    expect(carl).toMatchObject({ status: 'EXCUSED', excuseReason: null });
    const own = await stageApi(w.carl).get(`/v1/meetings/${id}/attendance`);
    expect(
      own.body.attendance.find(
        (r: { member: { membershipId: string } }) => r.member.membershipId === w.carl.membershipId,
      ).excuseReason,
    ).toBe('Je suis en voyage');
    const asAdmin = await stageApi(w.admin).get(`/v1/meetings/${id}/attendance`);
    expect(
      asAdmin.body.attendance.find(
        (r: { member: { membershipId: string } }) => r.member.membershipId === w.carl.membershipId,
      ).excuseReason,
    ).toBe('Je suis en voyage');
    const started = await insertMeeting(w.groupId, -5);
    const late = await act(w.carl, started, 'excuse', { reason: 'Trop tard' });
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('EXCUSE_TOO_LATE');
  });

  it('is for active members only: a newcomer or a member who left is refused', async () => {
    const id = await insertMeeting(w.groupId, 20);
    expect((await act(w.newcomer, id, 'check-in')).body.code).toBe('NOT_ACTIVE_MEMBER');
    expect((await act(w.leaver, id, 'check-in')).status).toBe(403);
    expect((await act(w.stranger, id, 'check-in')).status).toBe(404);
    expect((await stageApi(null).post(`/v1/meetings/${id}/check-in`)).status).toBe(401);
  });
});

describe('the admin marks attendance (R15.3)', () => {
  it('is a card for several members at once, from the opening of check-in', async () => {
    const id = await insertMeeting(w.groupId, 15);
    const marks = [
      { membershipId: w.bea.membershipId, present: true },
      { membershipId: w.dina.membershipId, present: false },
    ];
    const card = await stageApi(w.admin).put(`/v1/meetings/${id}/attendance`, { marks });
    expect(card.status).toBe(201);
    expect(card.body.action.type).toBe('MEETING_ATTENDANCE');
    expect((await confirmCard(w.admin, card.body.action.id)).status).toBe(200);
    const rows = await getPrisma().attendance.findMany({ where: { meetingId: id } });
    expect(rows.find((r) => r.membershipId === w.bea.membershipId)).toMatchObject({
      present: true,
      markedByMembershipId: w.admin.membershipId,
    });
    expect(rows.find((r) => r.membershipId === w.dina.membershipId)).toMatchObject({
      present: false,
    });
    expect((await meetingOf(w.bea, id)).me.status).toBe('PRESENT');
  });

  it('refuses a marked person who is not an active member, an early mark, and non-admins', async () => {
    const id = await insertMeeting(w.groupId, 15);
    const outsider = await stageApi(w.admin).put(`/v1/meetings/${id}/attendance`, {
      marks: [{ membershipId: w.newcomer.membershipId, present: true }],
    });
    expect(outsider.status).toBe(400);
    expect(outsider.body.code).toBe('NOT_A_PARTICIPANT');
    const early = await insertMeeting(w.groupId, 3 * 60);
    const tooEarly = await stageApi(w.admin).put(`/v1/meetings/${early}/attendance`, {
      marks: [{ membershipId: w.bea.membershipId, present: true }],
    });
    expect(tooEarly.body.code).toBe('MARK_NOT_ALLOWED');
    const asMember = await stageApi(w.bea).put(`/v1/meetings/${id}/attendance`, {
      marks: [{ membershipId: w.bea.membershipId, present: true }],
    });
    expect(asMember.status).toBe(403);
  });
});
