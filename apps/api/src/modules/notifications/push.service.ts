// Push delivery (spec 2.13): after the in-app notification is committed, job `notifications.push`
// sends it to the user's devices if their preferences allow it now; job `notifications.receipts`
// checks the receipts later and removes tokens Expo no longer knows.
import { proposalTexts } from '@njangi/shared/i18n/server/proposals';
import { clock } from '../../lib/clock';
import { getPrisma } from '../../lib/prisma';
import { shouldPush } from './delivery-rules';
import { getPushSender } from './push-sender';

const RECEIPT_DELAY_MS = 15 * 60 * 1000;

function forget(deviceIds: string[]) {
  if (deviceIds.length === 0) return Promise.resolve();
  return getPrisma().device.updateMany({
    where: { id: { in: deviceIds } },
    data: { expoPushToken: null, revokedAt: clock.now() },
  });
}

/** Sends one notification to every active device of its user. Idempotent per notification. */
export async function pushNotification(
  notificationId: string,
): Promise<'SENT' | 'NOT_SENT' | 'FAILED'> {
  const prisma = getPrisma();
  const claimed = await prisma.notification.updateMany({
    where: { id: notificationId, pushStatus: 'NOT_SENT', pushTickets: { none: {} } },
    data: { pushStatus: 'QUEUED' },
  });
  if (claimed.count !== 1) return 'NOT_SENT';
  const n = await prisma.notification.findUniqueOrThrow({
    where: { id: notificationId },
    include: {
      user: {
        select: {
          language: true,
          deletedAt: true,
          notificationPrefs: true,
          devices: {
            where: { revokedAt: null, expoPushToken: { not: null } },
            select: { id: true, expoPushToken: true },
          },
        },
      },
    },
  });
  const prefs = n.user.notificationPrefs ?? {
    mutedCategories: [],
    quietStartMinute: 1260,
    quietEndMinute: 420,
  };
  const devices = n.user.devices;
  if (
    n.user.deletedAt ||
    devices.length === 0 ||
    !shouldPush({ category: n.category, prefs, now: clock.now() })
  ) {
    await prisma.notification.update({ where: { id: n.id }, data: { pushStatus: 'NOT_SENT' } });
    return 'NOT_SENT';
  }
  const fr = n.user.language === 'fr';
  const results = await getPushSender().send(
    devices.map((d) => ({
      to: d.expoPushToken!,
      title: fr ? n.titleFr : n.titleEn,
      // A lock screen shows the push: a vote's names and amounts stay in the app (D20.2, L7).
      body:
        n.category === 'VOTES'
          ? proposalTexts.pushNeutralBody[fr ? 'fr' : 'en']
          : fr
            ? n.bodyFr
            : n.bodyEn,
      data: { notificationId: n.id, deepLink: n.deepLink },
    })),
  );
  await prisma.pushTicket.createMany({
    data: results.map((r, i) => ({
      notificationId: n.id,
      deviceId: devices[i]!.id,
      status: r.ok ? 'OK' : 'ERROR',
      ticketId: r.ok ? r.ticketId : null,
      error: r.ok ? null : r.error,
    })),
  });
  await forget(
    results.flatMap((r, i) => (!r.ok && r.error === 'DeviceNotRegistered' ? [devices[i]!.id] : [])),
  );
  const sent = results.some((r) => r.ok);
  await prisma.notification.update({
    where: { id: n.id },
    data: {
      pushStatus: sent ? 'SENT' : 'FAILED',
      pushTicketId: results.find((r) => r.ok && 'ticketId' in r)?.ticketId ?? null,
    },
  });
  return sent ? 'SENT' : 'FAILED';
}

/** Checks receipts of tickets older than 15 minutes; DeviceNotRegistered removes the token. */
export async function checkPushReceipts(now: Date = clock.now()): Promise<number> {
  const prisma = getPrisma();
  const tickets = await prisma.pushTicket.findMany({
    where: {
      status: 'OK',
      checkedAt: null,
      ticketId: { not: null },
      createdAt: { lte: new Date(now.getTime() - RECEIPT_DELAY_MS) },
    },
    select: { id: true, ticketId: true, deviceId: true, notificationId: true },
    take: 1_000,
  });
  if (tickets.length === 0) return 0;
  const receipts = await getPushSender().receipts(tickets.map((t) => t.ticketId!));
  const gone: string[] = [];
  for (const t of tickets) {
    const r = receipts.get(t.ticketId!);
    if (!r) continue;
    await prisma.pushTicket.update({
      where: { id: t.id },
      data: { status: r.ok ? 'DELIVERED' : 'FAILED', error: r.ok ? null : r.error, checkedAt: now },
    });
    if (r.ok)
      await prisma.notification.update({
        where: { id: t.notificationId },
        data: { pushStatus: 'DELIVERED' },
      });
    else if (r.error === 'DeviceNotRegistered') gone.push(t.deviceId);
  }
  await forget(gone);
  return receipts.size;
}
