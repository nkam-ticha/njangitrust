// What the admin does in the chat (R1.2, CHT-02) and what the agent may only propose (spec 4.5):
// announcements, hiding a message, and `post_to_group` all go through a card the member confirms.
import { beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '../../lib/prisma';
import { recordRealtimeEvents, stopRecording } from '../../realtime/emitter';
import { chatWorld, type ChatWorld } from '../../../test/helpers/chat-world';
import type { TestUser } from '../../../test/helpers/client';
import { confirmCard, stageApi } from '../../../test/helpers/stage-client';
import { requestPost } from './chat.actions';

let w: ChatWorld;
beforeAll(async () => {
  w = await chatWorld();
});

const say = (user: TestUser, text: string) =>
  stageApi(user).post(`/v1/groups/${w.groupId}/messages`, { text });

describe('announcements', () => {
  it('are a card for the admin; confirmed, the message is pinned and every member is told', async () => {
    const card = await stageApi(w.admin).post(`/v1/groups/${w.groupId}/announcements`, {
      text: 'La réunion du samedi est déplacée à 16 h.',
    });
    expect(card.status).toBe(201);
    expect(card.body.action).toMatchObject({
      type: 'CHAT_ANNOUNCE',
      level: 'L1',
      status: 'PENDING',
    });
    // Nothing is posted until the admin confirms.
    expect(
      await getPrisma().message.count({ where: { groupId: w.groupId, isAnnouncement: true } }),
    ).toBe(0);

    const events = recordRealtimeEvents();
    try {
      const done = await confirmCard(w.admin, card.body.action.id);
      expect(done.status).toBe(200);
      expect(done.body.action.status).toBe('DONE');
      expect(events.some((e) => e.event === 'message.created')).toBe(true);
    } finally {
      stopRecording(events);
    }
    const pinned = await stageApi(w.bea).get(`/v1/groups/${w.groupId}/messages?pinned=true`);
    expect(pinned.body.messages).toHaveLength(1);
    expect(pinned.body.messages[0]).toMatchObject({
      isAnnouncement: true,
      text: 'La réunion du samedi est déplacée à 16 h.',
      author: { membershipId: w.admin.membershipId },
    });
    for (const member of [w.bea, w.carl, w.dina]) {
      const notices = await getPrisma().notification.findMany({
        where: { userId: member.id, groupId: w.groupId, titleEn: { contains: 'announcement' } },
      });
      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatchObject({
        category: 'GROUP',
        bodyFr: 'La réunion du samedi est déplacée à 16 h.',
      });
    }
    expect(
      await getPrisma().notification.count({
        where: { userId: w.admin.id, groupId: w.groupId, titleEn: { contains: 'announcement' } },
      }),
    ).toBe(0);
  });

  it('are for the admin only, and for a member of the group only', async () => {
    const asMember = await stageApi(w.bea).post(`/v1/groups/${w.groupId}/announcements`, {
      text: 'Annonce',
    });
    expect(asMember.status).toBe(403);
    expect(asMember.body.code).toBe('ADMIN_ONLY');
    expect(
      (
        await stageApi(w.stranger).post(`/v1/groups/${w.groupId}/announcements`, {
          text: 'Annonce',
        })
      ).status,
    ).toBe(404);
    expect(
      (await stageApi(null).post(`/v1/groups/${w.groupId}/announcements`, { text: 'Annonce' }))
        .status,
    ).toBe(401);
    expect(
      (await stageApi(w.admin).post(`/v1/groups/${w.groupId}/announcements`, { text: '' })).status,
    ).toBe(400);
  });
});

describe('hiding a message (CHT-02)', () => {
  it('is a card for the admin; confirmed, the message disappears for the group and the reason is logged', async () => {
    const abusive = await say(w.carl, 'Un message déplacé');
    const id = abusive.body.message.id as string;
    const card = await stageApi(w.admin).post(`/v1/messages/${id}/hide`, {
      reason: 'Propos insultants',
    });
    expect(card.status).toBe(201);
    expect(card.body.action).toMatchObject({ type: 'CHAT_HIDE', status: 'PENDING' });
    expect(
      (await getPrisma().message.findUniqueOrThrow({ where: { id } })).hiddenByAdminAt,
    ).toBeNull();

    const events = recordRealtimeEvents();
    try {
      expect((await confirmCard(w.admin, card.body.action.id)).status).toBe(200);
      expect(events.filter((e) => e.event === 'message.hidden').map((e) => e.payload)).toEqual([
        { id, groupId: w.groupId },
      ]);
    } finally {
      stopRecording(events);
    }
    const list = await stageApi(w.bea).get(`/v1/groups/${w.groupId}/messages?limit=100`);
    const hidden = (
      list.body.messages as { id: string; removed: string | null; text: string | null }[]
    ).find((m) => m.id === id);
    expect(hidden).toMatchObject({ removed: 'HIDDEN', text: null });
    const log = await getPrisma().auditLog.findFirst({
      where: { action: 'chat.message.hidden', target: `Message:${id}` },
    });
    expect(log).toMatchObject({
      actorUserId: w.admin.id,
      groupId: w.groupId,
      details: { reason: 'Propos insultants' },
    });
    const again = await stageApi(w.admin).post(`/v1/messages/${id}/hide`, { reason: 'Encore' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('MESSAGE_ALREADY_REMOVED');
  });

  it('is refused to a member, for a stranger and for system messages', async () => {
    const mine = await say(w.bea, 'Un message correct');
    const id = mine.body.message.id as string;
    const asMember = await stageApi(w.carl).post(`/v1/messages/${id}/hide`, {
      reason: 'Je n’aime pas',
    });
    expect(asMember.status).toBe(403);
    expect(asMember.body.code).toBe('ADMIN_ONLY');
    expect(
      (await stageApi(w.stranger).post(`/v1/messages/${id}/hide`, { reason: 'x y' })).status,
    ).toBe(404);
    expect((await stageApi(w.admin).post(`/v1/messages/${id}/hide`, {})).status).toBe(400);
    const system = await getPrisma().message.findFirstOrThrow({
      where: { groupId: w.groupId, kind: 'SYSTEM' },
    });
    const onSystem = await stageApi(w.admin).post(`/v1/messages/${system.id}/hide`, {
      reason: 'Test',
    });
    expect(onSystem.status).toBe(409);
    expect(onSystem.body.code).toBe('MESSAGE_NOT_HIDEABLE');
  });
});

describe('post_to_group (L1, the agent proposes, the member confirms)', () => {
  it('posts nothing until the member confirms the card the server drew', async () => {
    const card = await requestPost(
      { userId: w.bea.id, lang: 'fr', sessionId: 'agent', client: 'mobile' },
      w.groupId,
      { text: 'Bonjour de la part de Bea' },
    );
    expect(card).toMatchObject({
      type: 'CHAT_POST',
      origin: 'AGENT',
      level: 'L1',
      status: 'PENDING',
    });
    expect(
      await getPrisma().message.count({
        where: { groupId: w.groupId, text: 'Bonjour de la part de Bea' },
      }),
    ).toBe(0);
    const stranger = await stageApi(w.carl).post(`/v1/pending-actions/${card.id}/confirm`, {});
    expect(stranger.status).toBe(404);
    const done = await confirmCard(w.bea, card.id);
    expect(done.status).toBe(200);
    const posted = await getPrisma().message.findFirstOrThrow({
      where: { groupId: w.groupId, text: 'Bonjour de la part de Bea' },
    });
    expect(posted.authorMembershipId).toBe(w.bea.membershipId);
  });

  it('is refused for someone who may not post', async () => {
    await expect(
      requestPost(
        { userId: w.leaver.id, lang: 'en', sessionId: 'agent', client: 'mobile' },
        w.groupId,
        { text: 'Hello' },
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
