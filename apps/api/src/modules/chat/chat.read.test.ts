// Unread counts, read markers, the per-member mute (push only), chat notifications and the data
// `summarize_unread` hands to the future agent (spec 1.8, 2.13, 4.9, CHT-03).
import { beforeAll, describe, expect, it } from 'vitest';
import { chatStateSchema, chatUnreadAllSchema } from '@njangi/shared/contracts/chat-messages';
import { AfterCommit } from '../../lib/after-commit';
import { useJobScheduler } from '../../jobs/dispatch';
import { getPrisma } from '../../lib/prisma';
import { chatWorld, type ChatWorld } from '../../../test/helpers/chat-world';
import type { TestUser } from '../../../test/helpers/client';
import { FILES, uploadFile } from '../../../test/helpers/media-files';
import { stageApi } from '../../../test/helpers/stage-client';
import { postAgentMessage } from './chat.messages';
import { summarizeUnread, SUMMARY_MAX_MESSAGES } from './chat.read';
import { postSystemMessage } from './chat.service';

let w: ChatWorld;
beforeAll(async () => {
  w = await chatWorld();
});

const post = (user: TestUser, body: Record<string, unknown>) =>
  stageApi(user).post(`/v1/groups/${w.groupId}/messages`, body);
const state = async (user: TestUser) => {
  const res = await stageApi(user).get(`/v1/groups/${w.groupId}/chat`);
  expect(res.status).toBe(200);
  return chatStateSchema.parse(res.body);
};
const markRead = (user: TestUser, body: Record<string, unknown> = {}) =>
  stageApi(user).post(`/v1/groups/${w.groupId}/read-marker`, body);
const chatNotices = (userId: string) =>
  getPrisma().notification.findMany({
    where: { userId, groupId: w.groupId },
    orderBy: { createdAt: 'asc' },
  });

describe('unread counts and read markers', () => {
  it('counts what others wrote since the marker, mentions apart, and never your own messages', async () => {
    for (const u of [w.admin, w.bea, w.carl, w.dina]) await markRead(u);
    await post(w.admin, { text: 'Réunion samedi', mentions: [w.bea.membershipId] });
    await post(w.admin, { text: 'Merci de confirmer' });
    await post(w.bea, { text: 'Je confirme' });
    expect(await state(w.bea)).toMatchObject({ unread: 2, mentions: 1, muted: false });
    expect(await state(w.carl)).toMatchObject({ unread: 3, mentions: 0 });
    expect(await state(w.admin)).toMatchObject({ unread: 1 });
  });

  it('marks everything read, only moving the marker forward, and clears the chat notifications', async () => {
    const before = await state(w.carl);
    expect(before.unread).toBe(3);
    expect((await chatNotices(w.carl.id)).some((n) => n.readAt === null)).toBe(true);
    const res = await markRead(w.carl);
    expect(res.status).toBe(200);
    const after = chatStateSchema.parse(res.body);
    expect(after).toMatchObject({ unread: 0, mentions: 0 });
    expect((await chatNotices(w.carl.id)).every((n) => n.readAt !== null)).toBe(true);
    const old = await markRead(w.carl, { upTo: '2020-01-01T00:00:00.000Z' });
    expect(old.body.lastReadAt).toBe(after.lastReadAt);
  });

  it('does not accept a marker in the future (it would hide messages not yet written)', async () => {
    const res = await markRead(w.dina, { upTo: '2099-01-01T00:00:00.000Z' });
    expect(new Date(res.body.lastReadAt).getTime()).toBeLessThanOrEqual(Date.now() + 1_000);
    await post(w.admin, { text: 'Après le marqueur' });
    expect((await state(w.dina)).unread).toBe(1);
  });

  it('lists the state of every group the member reads', async () => {
    const res = await stageApi(w.bea).get('/v1/chat/unread');
    expect(res.status).toBe(200);
    const { groups } = chatUnreadAllSchema.parse(res.body);
    expect(groups.map((g) => g.groupId)).toContain(w.groupId);
    expect((await stageApi(null).get('/v1/chat/unread')).status).toBe(401);
  });

  it('answers 404 to a stranger and 403 to a member who left', async () => {
    expect((await stageApi(w.stranger).get(`/v1/groups/${w.groupId}/chat`)).status).toBe(404);
    expect((await stageApi(w.leaver).get(`/v1/groups/${w.groupId}/chat`)).status).toBe(403);
    expect((await markRead(w.leaver)).status).toBe(403);
  });
});

describe('notifications of the chat (spec 2.13) and the mute (push only)', () => {
  const dispatched: { name: string; data: Record<string, unknown> }[] = [];
  const pushedTo = async (userId: string) => {
    const ids = (await chatNotices(userId)).map((n) => n.id);
    return dispatched.filter(
      (d) => d.name === 'notifications.push' && ids.includes(String(d.data.notificationId)),
    );
  };

  it('notifies once per burst, and a mute removes only the push', async () => {
    const group = await chatWorld();
    const say = (user: TestUser, body: Record<string, unknown>) =>
      stageApi(user).post(`/v1/groups/${group.groupId}/messages`, body);
    for (const u of [group.bea, group.carl, group.dina]) {
      await stageApi(u).post(`/v1/groups/${group.groupId}/read-marker`, {});
    }
    const muted = await stageApi(group.carl).put(`/v1/groups/${group.groupId}/chat-mute`, {
      muted: true,
    });
    expect(chatStateSchema.parse(muted.body).muted).toBe(true);
    const prefs = await stageApi(group.carl).get('/v1/me/notification-prefs');
    expect(prefs.body.prefs.mutedChatGroupIds).toContain(group.groupId);

    dispatched.length = 0;
    useJobScheduler((name, data) => {
      dispatched.push({ name, data });
      return Promise.resolve();
    });
    try {
      await say(group.admin, { text: 'Premier message' });
      await say(group.admin, { text: 'Deuxième message' });
      const link = `/groups/${group.groupId}/chat`;
      const forBea = await getPrisma().notification.findMany({
        where: { userId: group.bea.id, groupId: group.groupId, deepLink: link },
      });
      const forCarl = await getPrisma().notification.findMany({
        where: { userId: group.carl.id, groupId: group.groupId, deepLink: link },
      });
      // One notification each, not one per message.
      expect(forBea).toHaveLength(1);
      expect(forCarl).toHaveLength(1);
      expect(forBea[0]).toMatchObject({ category: 'GROUP', deepLink: link });
      expect(forBea[0]!.bodyEn).not.toContain('premier');
      const pushed = dispatched
        .filter((d) => d.name === 'notifications.push')
        .map((d) => d.data.notificationId);
      expect(pushed).toContain(forBea[0]!.id);
      expect(pushed).not.toContain(forCarl[0]!.id);
      // The author is not told about their own message.
      expect(
        await getPrisma().notification.count({
          where: { userId: group.admin.id, groupId: group.groupId, deepLink: link },
        }),
      ).toBe(0);

      // A mention always pushes, even to a muted member.
      dispatched.length = 0;
      await say(group.admin, {
        text: 'Carl, tu peux venir ?',
        mentions: [group.carl.membershipId],
      });
      const mention = (
        await getPrisma().notification.findMany({
          where: {
            userId: group.carl.id,
            groupId: group.groupId,
            deepLink: { contains: '?message=' },
          },
        })
      )[0]!;
      expect(mention.titleEn).toBe(`${group.admin.name} mentioned you`);
      expect(dispatched.map((d) => d.data.notificationId)).toContain(mention.id);
    } finally {
      useJobScheduler(null);
    }
  });

  it('lets the member unmute again', async () => {
    const res = await stageApi(w.bea).put(`/v1/groups/${w.groupId}/chat-mute`, { muted: true });
    expect(res.body.muted).toBe(true);
    const back = await stageApi(w.bea).put(`/v1/groups/${w.groupId}/chat-mute`, { muted: false });
    expect(back.body.muted).toBe(false);
    expect(await pushedTo(w.bea.id)).toBeDefined();
  });
});

describe('summarize_unread (spec 4.9)', () => {
  it('returns the messages, the events and the media of the period, as data and without marking read', async () => {
    const group = await chatWorld();
    const user = group.bea;
    await stageApi(user).post(`/v1/groups/${group.groupId}/read-marker`, {});
    const say = (as: TestUser, body: Record<string, unknown>) =>
      stageApi(as).post(`/v1/groups/${group.groupId}/messages`, body);
    await say(group.admin, { text: 'Réunion samedi', mentions: [user.membershipId] });
    const photo = await uploadFile(group.carl, group.groupId, {
      kind: 'IMAGE',
      mime: 'image/jpeg',
      bytes: FILES.jpeg(),
    });
    await say(group.carl, { attachmentId: photo.id });
    const voice = await uploadFile(group.carl, group.groupId, {
      kind: 'VOICE',
      mime: 'audio/mp4',
      bytes: FILES.m4a(),
      durationSec: 42,
    });
    await say(group.carl, { attachmentId: voice.id });
    await say(user, { text: 'Mon propre message' });
    const effects = new AfterCommit();
    await postSystemMessage(group.groupId, { fr: 'Paul a payé.', en: 'Paul paid.' }, effects);
    await postAgentMessage(group.groupId, 'Voici le résumé du tour.');

    const summary = await summarizeUnread(user.id, group.groupId);
    expect(summary).toMatchObject({ groupId: group.groupId, total: 5, truncated: false });
    expect(summary.messages.map((m) => m.kind)).toEqual(['TEXT', 'IMAGE', 'VOICE', 'AGENT']);
    expect(summary.messages[0]).toMatchObject({ text: 'Réunion samedi', mentionsMe: true });
    expect(summary.messages[2]).toMatchObject({ kind: 'VOICE', text: null, durationSec: 42 });
    expect(summary.messages[3]!.author).toBeNull();
    expect(summary.events).toEqual([
      expect.objectContaining({ text: { fr: 'Paul a payé.', en: 'Paul paid.' } }),
    ]);
    expect(summary.mediaBySender).toEqual([
      expect.objectContaining({
        membershipId: group.carl.membershipId,
        images: 1,
        voiceNotes: 1,
        videos: 0,
        documents: 0,
      }),
    ]);
    expect((await stageApi(user).get(`/v1/groups/${group.groupId}/chat`)).body.unread).toBe(5);
  });

  it('reads at most the 500 most recent messages and says so', async () => {
    const group = await chatWorld();
    await stageApi(group.bea).post(`/v1/groups/${group.groupId}/read-marker`, {});
    await new Promise((r) => setTimeout(r, 20));
    await getPrisma().message.createMany({
      data: Array.from({ length: SUMMARY_MAX_MESSAGES + 7 }, (_, i) => ({
        groupId: group.groupId,
        authorMembershipId: group.carl.membershipId,
        kind: 'TEXT' as const,
        text: `Message ${i}`,
      })),
    });
    const summary = await summarizeUnread(group.bea.id, group.groupId);
    expect(summary.total).toBe(SUMMARY_MAX_MESSAGES + 7);
    expect(summary.truncated).toBe(true);
    expect(summary.messages).toHaveLength(SUMMARY_MAX_MESSAGES);
  });

  it('is not available to a stranger or a member who left', async () => {
    await expect(summarizeUnread(w.stranger.id, w.groupId)).rejects.toMatchObject({ status: 404 });
    await expect(summarizeUnread(w.leaver.id, w.groupId)).rejects.toMatchObject({ status: 403 });
  });
});
