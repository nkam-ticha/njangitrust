// The agent's meeting tools (spec 4.5, L1): `check_in`, `send_absence_excuse` and `add_agenda_item`
// can only propose a card, which the member confirms in the app; plus who may read a meeting and the
// job processors (ids in, nothing out).
import { beforeAll, describe, expect, it } from 'vitest';
import { getJobDefinition } from '../../jobs/registry';
import { getPrisma } from '../../lib/prisma';
import type { AuthActor } from '../../permissions';
import { chatWorld, type ChatWorld } from '../../../test/helpers/chat-world';
import { insertMeeting } from '../../../test/helpers/meeting-helpers';
import { stageApp } from '../../../test/helpers/stage-app';
import { confirmCard, stageApi } from '../../../test/helpers/stage-client';
import { requestAgendaItem, requestCheckIn, requestExcuse } from './meetings.member-actions';

let w: ChatWorld;
beforeAll(async () => {
  stageApp(); // registers the action handlers and jobs
  w = await chatWorld();
});

const asAgent = (userId: string): AuthActor => ({
  userId,
  lang: 'fr',
  sessionId: 'agent',
  client: 'mobile',
});

describe('cards proposed by the agent', () => {
  it('check_in: nothing is recorded until the member confirms the card', async () => {
    const id = await insertMeeting(w.groupId, 20);
    const card = await requestCheckIn(asAgent(w.bea.id), id);
    expect(card).toMatchObject({
      type: 'MEETING_CHECK_IN',
      origin: 'AGENT',
      level: 'L1',
      status: 'PENDING',
    });
    expect(await getPrisma().attendance.count({ where: { meetingId: id } })).toBe(0);
    expect((await stageApi(w.carl).post(`/v1/pending-actions/${card.id}/confirm`, {})).status).toBe(
      404,
    );
    expect((await confirmCard(w.bea, card.id)).status).toBe(200);
    expect(
      await getPrisma().attendance.count({
        where: { meetingId: id, membershipId: w.bea.membershipId, present: true },
      }),
    ).toBe(1);
  });

  it('send_absence_excuse and add_agenda_item are cards too, with the text on the card', async () => {
    const id = await insertMeeting(w.groupId, 40);
    const excuse = await requestExcuse(asAgent(w.carl.id), id, 'Je suis en déplacement');
    expect(JSON.stringify(excuse.preview)).toContain('Je suis en déplacement');
    await confirmCard(w.carl, excuse.id);
    expect(
      await getPrisma().attendance.count({
        where: { meetingId: id, membershipId: w.carl.membershipId, excused: true },
      }),
    ).toBe(1);
    const item = await requestAgendaItem(asAgent(w.dina.id), id, 'Parler de la caisse');
    await confirmCard(w.dina, item.id);
    expect(
      await getPrisma().agendaItem.count({ where: { meetingId: id, text: 'Parler de la caisse' } }),
    ).toBe(1);
  });

  it('are refused at once when the action would be (the same guards as the app)', async () => {
    const early = await insertMeeting(w.groupId, 4 * 60);
    await expect(requestCheckIn(asAgent(w.bea.id), early)).rejects.toMatchObject({
      code: 'CHECK_IN_NOT_OPEN_YET',
    });
    const started = await insertMeeting(w.groupId, -10);
    await expect(requestExcuse(asAgent(w.bea.id), started, 'Trop tard')).rejects.toMatchObject({
      code: 'EXCUSE_TOO_LATE',
    });
    await expect(requestCheckIn(asAgent(w.newcomer.id), started)).rejects.toMatchObject({
      status: 403,
    });
    await expect(requestCheckIn(asAgent(w.stranger.id), started)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('refuses a card when the meeting changed before the member confirmed it', async () => {
    const id = await insertMeeting(w.groupId, 20);
    const card = await requestCheckIn(asAgent(w.dina.id), id);
    await getPrisma().meeting.update({ where: { id }, data: { status: 'CANCELLED' } });
    const done = await confirmCard(w.dina, card.id);
    expect(done.status).toBeGreaterThanOrEqual(400);
    expect(await getPrisma().attendance.count({ where: { meetingId: id } })).toBe(0);
  });
});

describe('reading a meeting', () => {
  it('answers 200 to members, 404 to a stranger, 403 to a member who left, 401 to nobody', async () => {
    const id = await insertMeeting(w.groupId, 60);
    for (const user of [w.admin, w.bea, w.newcomer]) {
      expect((await stageApi(user).get(`/v1/meetings/${id}`)).status).toBe(200);
    }
    expect((await stageApi(w.stranger).get(`/v1/meetings/${id}`)).status).toBe(404);
    expect((await stageApi(w.leaver).get(`/v1/meetings/${id}`)).status).toBe(403);
    expect((await stageApi(null).get(`/v1/meetings/${id}`)).status).toBe(401);
    const unknown = await stageApi(w.bea).get('/v1/meetings/00000000-0000-4000-8000-000000000000');
    expect(unknown.body.code).toBe('MEETING_NOT_FOUND');
  });

  it('shows a newcomer (INVITED) the meeting but no way to check in or excuse', async () => {
    const id = await insertMeeting(w.groupId, 30);
    const view = (await stageApi(w.newcomer).get(`/v1/meetings/${id}`)).body.meeting;
    expect(view.me).toMatchObject({ canCheckIn: false, canExcuse: false, status: 'UNMARKED' });
  });
});

describe('the meeting jobs', () => {
  it('are registered with ids-only payloads and return nothing', async () => {
    for (const name of ['meetings.agenda', 'meetings.agendaScan']) {
      const job = getJobDefinition(name);
      expect(job, name).toBeDefined();
      const out = await job!.process({
        data: { meetingId: '00000000-0000-4000-8000-000000000000' },
        name,
        id: 'x',
      } as never);
      expect(out).toBeUndefined();
    }
  });
});
