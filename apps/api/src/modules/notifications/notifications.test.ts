// Notifications (spec 1.8, 2.13, FSD NOT-02, NOT-03): in-app first, then push by preferences.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  notificationListSchema,
  notificationPrefsResponseSchema,
} from '@njangi/shared/contracts/notifications';
import { resetTestClock, setTestClock } from '../../lib/clock';
import { getPrisma } from '../../lib/prisma';
import { settleBackground } from '../../jobs/dispatch';
import { api, type TestUser } from '../../../test/helpers/client';
import { signUp } from '../../../test/helpers/factories';
import { checkPushReceipts } from './push.service';
import { RecordingPushSender, setPushSenderForTests } from './push-sender';
import { notify } from './notifications.service';

let sender: RecordingPushSender;
const pushToken = () => `ExponentPushToken[${Math.random().toString(36).slice(2).padEnd(12, 'q')}]`;
const noon = new Date(Date.UTC(2026, 10, 6, 11, 0)); // 12:00 in Douala
const night = new Date(Date.UTC(2026, 10, 6, 22, 0)); // 23:00 in Douala

async function withDevice(): Promise<TestUser & { token: string }> {
  const user = await signUp();
  const token = pushToken();
  await api(user).post('/v1/me/devices', { platform: 'ANDROID', expoPushToken: token });
  return { ...user, token };
}

async function send(
  user: TestUser,
  category: 'MONEY' | 'SECURITY' | 'GROUP' | 'VOTES' = 'MONEY',
  body = { fr: 'Corps', en: 'Body' },
) {
  await notify([
    {
      userId: user.id,
      category,
      title: { fr: 'Titre', en: 'Title' },
      body,
    },
  ]);
  await settleBackground();
}

beforeAll(() => {
  sender = new RecordingPushSender();
  setPushSenderForTests(sender);
});
afterEach(() => resetTestClock());

describe('push delivery (spec 2.13)', () => {
  it('writes the in-app notification, then pushes it in the member’s language', async () => {
    setTestClock(noon);
    const user = await withDevice();
    await send(user);
    const pushed = sender.sent.filter((m) => m.to === user.token);
    expect(pushed).toEqual([
      {
        to: user.token,
        title: 'Titre',
        body: 'Corps',
        data: expect.objectContaining({ deepLink: null }),
      },
    ]);
    const row = await getPrisma().notification.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.pushStatus).toBe('SENT');
  });

  it('keeps names and amounts off the lock screen for a vote, and in the app', async () => {
    setTestClock(noon);
    const user = await withDevice();
    await send(user, 'VOTES', {
      fr: 'Exclure Joël Ndi du groupe, 25 000 FCFA dus',
      en: 'Remove Joël Ndi from the group, 25,000 FCFA owed',
    });
    const pushed = sender.sent.filter((m) => m.to === user.token);
    expect(pushed).toHaveLength(1);
    expect(pushed[0]!.body).not.toMatch(/Joël|25/);
    expect(pushed[0]!.title).toBe('Titre');
    const row = await getPrisma().notification.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.bodyFr).toContain('Joël Ndi');
  });

  it('keeps quiet hours and muted categories for pushes, never for SECURITY, and keeps the in-app copy', async () => {
    setTestClock(night);
    const user = await withDevice();
    await send(user, 'MONEY');
    await send(user, 'SECURITY');
    await api(user).put('/v1/me/notification-prefs', { mutedCategories: ['GROUP'] });
    setTestClock(noon);
    await send(user, 'GROUP');
    expect(sender.sent.filter((m) => m.to === user.token)).toHaveLength(1);
    expect(await getPrisma().notification.count({ where: { userId: user.id } })).toBe(3);
  });

  it('forgets a token the push service no longer knows', async () => {
    setTestClock(noon);
    const user = await withDevice();
    sender.unregistered.add(user.token);
    await send(user);
    const device = await getPrisma().device.findFirstOrThrow({ where: { userId: user.id } });
    expect(device.expoPushToken).toBeNull();
  });

  it('checks receipts after 15 minutes', async () => {
    setTestClock(noon);
    const user = await withDevice();
    await send(user);
    const ticket = await getPrisma().pushTicket.findFirstOrThrow({
      where: { notification: { userId: user.id } },
    });
    expect(ticket.status).toBe('OK');
    await checkPushReceipts(new Date(Date.now() + 16 * 60_000));
    expect(
      (await getPrisma().pushTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status,
    ).toBe('DELIVERED');
  });
});

describe('the notification list and the bell (spec 2.7, 1.8)', () => {
  it('lists only the member’s own, counts unread and marks them read', async () => {
    const user = await signUp();
    const other = await signUp();
    await send(user);
    await send(user);
    await send(other);
    const list = await api(user).get('/v1/notifications');
    expect(notificationListSchema.safeParse(list.body).success).toBe(true);
    // Sign-up writes no notification, so these are the two sent above.
    expect(list.body.notifications).toHaveLength(2);
    expect(list.body.unreadCount).toBe(2);
    const otherIds = (await api(other).get('/v1/notifications')).body.notifications.map(
      (n: { id: string }) => n.id,
    );
    // Someone else's ids are ignored.
    expect(
      (await api(user).post('/v1/notifications/read', { ids: otherIds })).body.unreadCount,
    ).toBe(2);
    expect(
      (await api(user).post('/v1/notifications/read', { ids: [list.body.notifications[0].id] }))
        .body.unreadCount,
    ).toBe(1);
    expect((await api(user).post('/v1/notifications/read', { all: true })).body.unreadCount).toBe(
      0,
    );
    expect((await api(user).get('/v1/notifications/unread-count')).body).toEqual({
      unreadCount: 0,
    });
    expect((await api(other).get('/v1/notifications/unread-count')).body).toEqual({
      unreadCount: 1,
    });
    expect((await api().get('/v1/notifications')).status).toBe(401);
  });

  it('pages with `before`', async () => {
    const user = await signUp();
    for (let i = 0; i < 3; i += 1) await send(user);
    const first = await api(user).get('/v1/notifications?limit=2');
    expect(first.body.notifications).toHaveLength(2);
    const next = await api(user).get(
      `/v1/notifications?limit=2&before=${encodeURIComponent(first.body.nextBefore)}`,
    );
    expect(next.body.notifications).toHaveLength(1);
    expect(next.body.nextBefore).toBeNull();
  });
});

describe('notification preferences (spec 1.8, NOT-03)', () => {
  it('starts with the defaults and refuses to mute SECURITY', async () => {
    const user = await signUp();
    const prefs = await api(user).get('/v1/me/notification-prefs');
    expect(notificationPrefsResponseSchema.safeParse(prefs.body).success).toBe(true);
    expect(prefs.body.prefs).toEqual({
      mutedCategories: [],
      quietHours: { from: '21:00', to: '07:00' },
      mutedChatGroupIds: [],
      mediaAutoDownload: 'WIFI_ONLY',
    });
    expect(
      (await api(user).put('/v1/me/notification-prefs', { mutedCategories: ['SECURITY'] })).status,
    ).toBe(400);
    const updated = await api(user).put('/v1/me/notification-prefs', {
      quietHours: { from: '22:30', to: '06:00' },
    });
    expect(updated.body.prefs.quietHours).toEqual({ from: '22:30', to: '06:00' });
    expect(updated.body.prefs.mediaAutoDownload).toBe('WIFI_ONLY');
  });
});
