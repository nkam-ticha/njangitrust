// Notifications of the group chat (spec 2.13, 1.8, FSD NOT-02, CHT-02). The in-app notification is
// always written first; the push follows (quiet hours and the Groupe category apply in the push job).
//
// - A new message notifies once per burst: while a member still has an unread chat notification for
//   the group, further messages add none, so the bell is not flooded.
// - The chat mute is per member and push only: a muted member still gets the in-app notification,
//   but no push is dispatched. A mention always pushes, muted or not ("mentions still do").
// - Titles and bodies never carry the text of a message: they show on lock screens.
import { bilingual, ui } from '../../lib/texts';
import { chatTexts as t } from '@njangi/shared/i18n/server/chat';
import { toNotification } from '../../dto';
import { emitToUser } from '../../realtime/emitter';
import { createNotifications } from '../notifications';
import type { Scope } from './scope';

/** Members who read the chat (R12.1: a newcomer reads at once) and so are told about it. */
const READER_STATUSES = ['INVITED', 'ACTIVE', 'LEAVING'] as const;

export const chatLink = (groupId: string) => `/groups/${groupId}/chat`;
export const messageLink = (groupId: string, messageId: string) =>
  `${chatLink(groupId)}?message=${messageId}`;

export interface NewMessageNotice {
  groupId: string;
  groupName: string;
  messageId: string;
  authorMembershipId: string;
  authorName: string;
  /** Mentioned memberships (the agent mention is not a member). */
  mentions: readonly string[];
}

/** The in-app notification without a push (a muted chat). */
async function inAppOnly(
  s: Scope,
  input: {
    userId: string;
    groupId: string;
    title: ReturnType<typeof bilingual>;
    body: ReturnType<typeof bilingual>;
    deepLink: string;
  },
): Promise<void> {
  const row = await s.db.notification.create({
    data: {
      userId: input.userId,
      groupId: input.groupId,
      category: 'GROUP',
      titleFr: input.title.fr,
      titleEn: input.title.en,
      bodyFr: input.body.fr,
      bodyEn: input.body.en,
      deepLink: input.deepLink,
    },
  });
  s.effects.add(() => emitToUser(row.userId, 'notification.created', toNotification(row)));
}

export async function notifyNewMessage(s: Scope, notice: NewMessageNotice): Promise<void> {
  const readers = await s.db.membership.findMany({
    where: {
      groupId: notice.groupId,
      status: { in: [...READER_STATUSES] },
      id: { not: notice.authorMembershipId },
    },
    select: { id: true, userId: true },
  });
  if (readers.length === 0) return;
  const mentioned = new Set(notice.mentions);
  const link = chatLink(notice.groupId);

  const mentions = readers.filter((r) => mentioned.has(r.id));
  await createNotifications(
    mentions.map((r) => ({
      userId: r.userId,
      groupId: notice.groupId,
      category: 'GROUP' as const,
      title: ui((c) => c.chat.message.mentionYou, { name: notice.authorName }),
      body: bilingual(t.mentionBody, { group: notice.groupName }),
      deepLink: messageLink(notice.groupId, notice.messageId),
    })),
    s.effects,
    s.db,
  );

  const others = readers.filter((r) => !mentioned.has(r.id));
  if (others.length === 0) return;
  const userIds = others.map((r) => r.userId);
  const [alreadyUnread, prefs] = await Promise.all([
    s.db.notification.findMany({
      where: { userId: { in: userIds }, groupId: notice.groupId, deepLink: link, readAt: null },
      select: { userId: true },
    }),
    s.db.notificationPrefs.findMany({
      where: { userId: { in: userIds }, mutedChatGroupIds: { has: notice.groupId } },
      select: { userId: true },
    }),
  ]);
  const skip = new Set(alreadyUnread.map((n) => n.userId));
  const muted = new Set(prefs.map((p) => p.userId));
  const title = bilingual(t.newMessagesTitle, { group: notice.groupName });
  const body = bilingual(t.newMessagesBody, { name: notice.authorName });
  const loud = others.filter((r) => !skip.has(r.userId) && !muted.has(r.userId));
  await createNotifications(
    loud.map((r) => ({
      userId: r.userId,
      groupId: notice.groupId,
      category: 'GROUP' as const,
      title,
      body,
      deepLink: link,
    })),
    s.effects,
    s.db,
  );
  for (const r of others.filter((o) => !skip.has(o.userId) && muted.has(o.userId))) {
    await inAppOnly(s, { userId: r.userId, groupId: notice.groupId, title, body, deepLink: link });
  }
}

/** An announcement is for everyone: the chat mute does not silence it. */
export async function notifyAnnouncement(
  s: Scope,
  notice: {
    groupId: string;
    groupName: string;
    messageId: string;
    authorMembershipId: string;
    text: string;
  },
): Promise<void> {
  const readers = await s.db.membership.findMany({
    where: {
      groupId: notice.groupId,
      status: { in: [...READER_STATUSES] },
      id: { not: notice.authorMembershipId },
    },
    select: { userId: true },
  });
  const preview = Array.from(notice.text).slice(0, 140).join('');
  await createNotifications(
    readers.map((r) => ({
      userId: r.userId,
      groupId: notice.groupId,
      category: 'GROUP' as const,
      title: bilingual(t.announcementTitle, { group: notice.groupName }),
      body: { fr: preview, en: preview },
      deepLink: messageLink(notice.groupId, notice.messageId),
    })),
    s.effects,
    s.db,
  );
}
