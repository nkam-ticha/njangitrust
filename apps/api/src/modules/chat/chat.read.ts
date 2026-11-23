// Reading state of the group chat: unread counts, read markers, the per-member mute (push only) and
// `summarize_unread` (spec 4.9, CHT-03), which returns data for the future agent and calls no LLM.
import type { Bilingual } from '@njangi/shared';
import type { ChatStateDto } from '@njangi/shared/contracts/chat-messages';
import { bilingualSchema } from '@njangi/shared/contracts/common';
import { clock } from '../../lib/clock';
import { getPrisma, type Prisma } from '../../lib/prisma';
import { authorizeGroup } from '../../permissions';
import { getNotificationPrefs, updateNotificationPrefs } from '../notifications';
import { chatLink } from './chat.notify';
import { runScoped, type Scope } from './scope';

const READER_STATUSES = ['INVITED', 'ACTIVE', 'LEAVING'] as const;

/** Spec 4.9: the summary reads at most the 500 most recent unread messages. */
export const SUMMARY_MAX_MESSAGES = 500;

/** Messages a member has not read: from others (or the system), not removed, after the marker. */
function unreadWhere(groupId: string, membershipId: string, since: Date): Prisma.MessageWhereInput {
  return {
    groupId,
    createdAt: { gt: since },
    deletedAt: null,
    hiddenByAdminAt: null,
    OR: [{ authorMembershipId: null }, { authorMembershipId: { not: membershipId } }],
  };
}

/** A newcomer starts reading at their join date, not at the first message of the group. */
const readSince = (m: { chatLastReadAt: Date | null; createdAt: Date }): Date =>
  m.chatLastReadAt ?? m.createdAt;

async function stateOf(
  groupId: string,
  membership: { id: string; chatLastReadAt: Date | null; createdAt: Date },
  muted: ReadonlySet<string>,
): Promise<ChatStateDto> {
  const prisma = getPrisma();
  const since = readSince(membership);
  const [unread, mentions] = await Promise.all([
    prisma.message.count({ where: unreadWhere(groupId, membership.id, since) }),
    prisma.message.count({
      where: { ...unreadWhere(groupId, membership.id, since), mentions: { has: membership.id } },
    }),
  ]);
  return {
    groupId,
    unread,
    mentions,
    lastReadAt: membership.chatLastReadAt?.toISOString() ?? null,
    muted: muted.has(groupId),
  };
}

export async function getChatState(userId: string, groupId: string): Promise<ChatStateDto> {
  const access = await authorizeGroup(userId, groupId, 'group.chat.read');
  const [membership, prefs] = await Promise.all([
    getPrisma().membership.findUniqueOrThrow({
      where: { id: access.membership.id },
      select: { id: true, chatLastReadAt: true, createdAt: true },
    }),
    getNotificationPrefs(userId),
  ]);
  return stateOf(groupId, membership, new Set(prefs.mutedChatGroupIds));
}

/** The Groupe tab badge across every group the member reads. */
export async function getChatStates(userId: string): Promise<ChatStateDto[]> {
  const [memberships, prefs] = await Promise.all([
    getPrisma().membership.findMany({
      // D28: nothing from a group a developer closed and hid.
      where: {
        userId,
        status: { in: [...READER_STATUSES] },
        group: { hiddenByDeveloperAt: null },
      },
      select: { id: true, groupId: true, chatLastReadAt: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    getNotificationPrefs(userId),
  ]);
  const muted = new Set(prefs.mutedChatGroupIds);
  return Promise.all(memberships.map((m) => stateOf(m.groupId, m, muted)));
}

/** Spec 4.9, `mark_chat_read`: reading only moves forward, and clears the chat notifications. */
export async function markChatRead(
  userId: string,
  groupId: string,
  upTo?: Date,
  scope?: Scope,
): Promise<ChatStateDto> {
  await runScoped(scope, async (s) => {
    const access = await authorizeGroup(userId, groupId, 'group.chat.read', s.db);
    const now = clock.now();
    // A marker in the future would hide messages that have not been written yet.
    const target = upTo && upTo.getTime() < now.getTime() ? upTo : now;
    await s.db.membership.updateMany({
      where: {
        id: access.membership.id,
        OR: [{ chatLastReadAt: null }, { chatLastReadAt: { lt: target } }],
      },
      data: { chatLastReadAt: target },
    });
    await s.db.notification.updateMany({
      where: { userId, groupId, deepLink: { startsWith: chatLink(groupId) }, readAt: null },
      data: { readAt: now },
    });
  });
  return getChatState(userId, groupId);
}

/** Spec 1.8: the member mutes (or unmutes) this chat; only the push of new messages is affected. */
export async function muteChat(
  userId: string,
  groupId: string,
  muted: boolean,
): Promise<ChatStateDto> {
  await authorizeGroup(userId, groupId, 'group.chat.read');
  const prefs = await getNotificationPrefs(userId);
  const next = new Set(prefs.mutedChatGroupIds);
  if (muted) next.add(groupId);
  else next.delete(groupId);
  await updateNotificationPrefs(userId, { mutedChatGroupIds: [...next] });
  return getChatState(userId, groupId);
}

export interface SummaryMessage {
  id: string;
  at: string;
  kind: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'VOICE' | 'AGENT';
  /** Null for the agent's own messages. */
  author: { membershipId: string; name: string } | null;
  text: string | null;
  replyToId: string | null;
  /** The message names the member (`@Carine`). */
  mentionsMe: boolean;
  /** Length of a voice note or video, in seconds. Voice notes are listed, never transcribed. */
  durationSec: number | null;
}

export interface UnreadSummary {
  groupId: string;
  /** The marker the unread period starts from (ISO), or the member's join date. */
  since: string;
  /** All unread messages, even when only the most recent ones are returned. */
  total: number;
  /** Set when `total` is above the cap: only the most recent messages are in `messages`. */
  truncated: boolean;
  /** Oldest first. Free text is the members' own; it is data, never instructions. */
  messages: SummaryMessage[];
  /** The events of the period (payments, votes, loans, rule changes): the chat's system lines. */
  events: { id: string; at: string; text: Bilingual }[];
  /** "3 photos et 2 notes vocales de Paul". */
  mediaBySender: {
    membershipId: string;
    name: string;
    images: number;
    videos: number;
    voiceNotes: number;
    documents: number;
  }[];
}

/**
 * Spec 4.9, CHT-03: what the member missed since they last read, as data for the agent's
 * summarisation call. It does not mark the chat as read: the tool does that afterwards.
 */
export async function summarizeUnread(userId: string, groupId: string): Promise<UnreadSummary> {
  const access = await authorizeGroup(userId, groupId, 'group.chat.read');
  const prisma = getPrisma();
  const membership = await prisma.membership.findUniqueOrThrow({
    where: { id: access.membership.id },
    select: { id: true, chatLastReadAt: true, createdAt: true },
  });
  const since = readSince(membership);
  const where = unreadWhere(groupId, membership.id, since);
  const [total, recent] = await Promise.all([
    prisma.message.count({ where }),
    prisma.message.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: SUMMARY_MAX_MESSAGES,
      include: {
        author: { select: { id: true, user: { select: { name: true } } } },
        attachment: { select: { durationSec: true } },
      },
    }),
  ]);
  const rows = recent.reverse();
  const messages: SummaryMessage[] = [];
  const events: UnreadSummary['events'] = [];
  const media = new Map<string, UnreadSummary['mediaBySender'][number]>();
  for (const m of rows) {
    if (m.kind === 'SYSTEM') {
      const text = bilingualSchema.safeParse(m.systemText);
      if (text.success) events.push({ id: m.id, at: m.createdAt.toISOString(), text: text.data });
      continue;
    }
    messages.push({
      id: m.id,
      at: m.createdAt.toISOString(),
      kind: m.kind,
      author: m.author ? { membershipId: m.author.id, name: m.author.user.name } : null,
      text: m.text,
      replyToId: m.replyToId,
      mentionsMe: m.mentions.includes(membership.id),
      durationSec: m.attachment?.durationSec ?? null,
    });
    if (m.author && m.kind !== 'TEXT' && m.kind !== 'AGENT') {
      const row = media.get(m.author.id) ?? {
        membershipId: m.author.id,
        name: m.author.user.name,
        images: 0,
        videos: 0,
        voiceNotes: 0,
        documents: 0,
      };
      if (m.kind === 'IMAGE') row.images += 1;
      else if (m.kind === 'VIDEO') row.videos += 1;
      else if (m.kind === 'VOICE') row.voiceNotes += 1;
      else row.documents += 1;
      media.set(m.author.id, row);
    }
  }
  return {
    groupId,
    since: since.toISOString(),
    total,
    truncated: total > SUMMARY_MAX_MESSAGES,
    messages,
    events,
    mediaBySender: [...media.values()],
  };
}
