// Group chat messages (spec 1.5, 2.7 Chat, 4.4, CHT-01, CHT-02): text, photo, video, document and
// voice-note messages, replies, mentions, deleting your own message, the admin hiding or pinning.
// Every function acts as the given member, so the agent's tools wrap them unchanged. Realtime,
// notifications and the `@njangi` call to the agent go on the after-commit queue.
import type {
  ChatMessageDto,
  MessageListQuery,
  SendMessageRequest,
} from '@njangi/shared/contracts/chat-messages';
import { clock } from '../../lib/clock';
import { componentLogger } from '../../lib/logger';
import { getPrisma, isUniqueViolation, type Db, type Prisma } from '../../lib/prisma';
import { authorizeGroup } from '../../permissions';
import { emitToGroup } from '../../realtime/emitter';
import { toChatMessage, type ChatMessageSource } from '../../dto/chat';
import { audit } from '../audit';
import { removeAttachmentFiles } from '../media';
import { agentPort, mentionsAgent } from './agent-port';
import { chatError } from './chat.errors';
import { notifyAnnouncement, notifyNewMessage } from './chat.notify';
import { runScoped, type Scope } from './scope';

const authorSelect = { select: { id: true, user: { select: { name: true } } } } as const;

/** Everything `toChatMessage` needs, loaded with one query. */
export const messageInclude = {
  author: authorSelect,
  attachment: true,
  replyTo: {
    select: {
      id: true,
      kind: true,
      text: true,
      deletedAt: true,
      hiddenByAdminAt: true,
      author: authorSelect,
    },
  },
} satisfies Prisma.MessageInclude;

const READER_STATUSES = ['INVITED', 'ACTIVE', 'LEAVING'] as const;
const log = componentLogger('chat');

export interface SendResult {
  message: ChatMessageDto;
  /** False when the same message id had already been stored (a queued message sent twice). */
  created: boolean;
}

async function existingByClientId(
  db: Db,
  id: string,
  groupId: string,
  membershipId: string,
): Promise<ChatMessageDto> {
  const found = await db.message.findUnique({ where: { id }, include: messageInclude });
  if (!found || found.groupId !== groupId || found.authorMembershipId !== membershipId) {
    throw chatError('MESSAGE_ID_TAKEN');
  }
  return toChatMessage(found);
}

async function checkMentions(
  db: Db,
  groupId: string,
  mentions: readonly string[],
): Promise<string[]> {
  const unique = [...new Set(mentions)];
  if (unique.length === 0) return [];
  const members = await db.membership.count({
    where: { id: { in: unique }, groupId, status: { in: [...READER_STATUSES] } },
  });
  if (members !== unique.length) throw chatError('MENTION_NOT_A_MEMBER');
  return unique;
}

async function storeMessage(
  s: Scope,
  userId: string,
  groupId: string,
  input: SendMessageRequest,
): Promise<SendResult> {
  const access = await authorizeGroup(userId, groupId, 'group.chat.post', s.db);
  const membershipId = access.membership.id;
  if (input.id) {
    const duplicate = await s.db.message.findUnique({
      where: { id: input.id },
      select: { id: true },
    });
    if (duplicate) {
      return {
        message: await existingByClientId(s.db, input.id, groupId, membershipId),
        created: false,
      };
    }
  }
  const mentions = await checkMentions(s.db, groupId, input.mentions ?? []);
  if (input.replyToId) {
    const target = await s.db.message.findFirst({
      where: { id: input.replyToId, groupId },
      select: { id: true },
    });
    if (!target) throw chatError('REPLY_TARGET_INVALID');
  }
  let kind: ChatMessageDto['kind'] = 'TEXT';
  if (input.attachmentId) {
    const file = await s.db.attachment.findFirst({
      where: { id: input.attachmentId, groupId, uploaderMembershipId: membershipId, message: null },
      select: { kind: true },
    });
    if (!file) throw chatError('ATTACHMENT_NOT_USABLE');
    kind = file.kind;
  }
  const row = await s.db.message.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      groupId,
      authorMembershipId: membershipId,
      kind,
      text: input.text ?? null,
      attachmentId: input.attachmentId ?? null,
      replyToId: input.replyToId ?? null,
      mentions,
    },
    include: messageInclude,
  });
  const message = toChatMessage(row);
  const author = row.author!;
  s.effects.add(() => emitToGroup(groupId, 'message.created', message));
  await notifyNewMessage(s, {
    groupId,
    groupName: access.group.name,
    messageId: row.id,
    authorMembershipId: membershipId,
    authorName: author.user.name,
    mentions,
  });
  if (mentionsAgent(input.text)) {
    s.effects.add(() =>
      agentPort().onGroupMention({
        groupId,
        messageId: row.id,
        authorUserId: userId,
        authorMembershipId: membershipId,
      }),
    );
  }
  return { message, created: true };
}

/**
 * CHT-01: a member posts a message. A client-made `id` makes the call idempotent: a message queued
 * offline and sent twice is stored once and the second call answers `created: false`.
 */
export async function sendMessage(
  userId: string,
  groupId: string,
  input: SendMessageRequest,
  scope?: Scope,
): Promise<SendResult> {
  try {
    return await runScoped(scope, (s) => storeMessage(s, userId, groupId, input));
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // Two sends of the same id raced, or one file was attached to two messages.
    if (input.id) {
      const access = await authorizeGroup(userId, groupId, 'group.chat.post');
      return {
        message: await existingByClientId(getPrisma(), input.id, groupId, access.membership.id),
        created: false,
      };
    }
    throw chatError('ATTACHMENT_NOT_USABLE');
  }
}

/** Newest first, `limit` at a time; `before` is the id of the oldest message already shown. */
export async function listMessages(
  userId: string,
  groupId: string,
  query: MessageListQuery,
): Promise<{ messages: ChatMessageDto[]; nextBefore: string | null }> {
  await authorizeGroup(userId, groupId, 'group.chat.read');
  const prisma = getPrisma();
  const limit = query.limit ?? 50;
  const where: Prisma.MessageWhereInput = {
    groupId,
    ...(query.pinned === 'true'
      ? { isAnnouncement: true, deletedAt: null, hiddenByAdminAt: null }
      : {}),
  };
  if (query.before) {
    const cursor = await prisma.message.findFirst({
      where: { id: query.before, groupId },
      select: { id: true, createdAt: true },
    });
    if (!cursor) throw chatError('MESSAGE_NOT_FOUND');
    where.OR = [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ];
  }
  const rows = await prisma.message.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: messageInclude,
  });
  const page = rows.slice(0, limit);
  return {
    messages: page.map((r) => toChatMessage(r as ChatMessageSource)),
    nextBefore: rows.length > limit ? page[page.length - 1]!.id : null,
  };
}

/** CHT-02: an author deletes their own message; its text and its file go with it (spec 2.12). */
export async function deleteMessage(
  userId: string,
  messageId: string,
  scope?: Scope,
): Promise<void> {
  const found = await getPrisma().message.findUnique({
    where: { id: messageId },
    select: { groupId: true },
  });
  if (!found) throw chatError('MESSAGE_NOT_FOUND');
  const files = await runScoped(scope, async (s) => {
    const access = await authorizeGroup(userId, found.groupId, 'group.chat.post', s.db);
    const message = await s.db.message.findUnique({
      where: { id: messageId },
      include: { attachment: { select: { id: true, storageKey: true, thumbnailKey: true } } },
    });
    if (!message) throw chatError('MESSAGE_NOT_FOUND');
    if (message.authorMembershipId !== access.membership.id) throw chatError('NOT_YOUR_MESSAGE');
    if (message.deletedAt || message.hiddenByAdminAt) throw chatError('MESSAGE_ALREADY_REMOVED');
    await s.db.message.update({
      where: { id: messageId },
      data: { deletedAt: clock.now(), text: null, attachmentId: null },
    });
    if (message.attachment) await s.db.attachment.delete({ where: { id: message.attachment.id } });
    s.effects.add(() =>
      emitToGroup(found.groupId, 'message.deleted', { id: messageId, groupId: found.groupId }),
    );
    return message.attachment;
  });
  if (files)
    await removeAttachmentFiles(files).catch((error: unknown) =>
      log.warn({ err: error }, 'file removal failed'),
    );
}

/** CHT-02: the admin hides an abusive message; the reason goes to the audit log, not to the group. */
export async function hideMessage(
  userId: string,
  messageId: string,
  reason: string,
  scope?: Scope,
): Promise<void> {
  const found = await getPrisma().message.findUnique({
    where: { id: messageId },
    select: { groupId: true },
  });
  if (!found) throw chatError('MESSAGE_NOT_FOUND');
  await runScoped(scope, async (s) => {
    await authorizeGroup(userId, found.groupId, 'group.chat.hide', s.db);
    const message = await s.db.message.findUnique({ where: { id: messageId } });
    if (!message) throw chatError('MESSAGE_NOT_FOUND');
    if (message.authorMembershipId === null) throw chatError('MESSAGE_NOT_HIDEABLE');
    if (message.deletedAt || message.hiddenByAdminAt) throw chatError('MESSAGE_ALREADY_REMOVED');
    await s.db.message.update({ where: { id: messageId }, data: { hiddenByAdminAt: clock.now() } });
    await audit(
      {
        action: 'chat.message.hidden',
        actorUserId: userId,
        groupId: found.groupId,
        target: `Message:${messageId}`,
        details: { reason },
      },
      s.db,
    );
    s.effects.add(() =>
      emitToGroup(found.groupId, 'message.hidden', { id: messageId, groupId: found.groupId }),
    );
  });
}

/** R1.2: the admin pins an announcement at the top of the group and every member is told. */
export async function postAnnouncement(
  userId: string,
  groupId: string,
  text: string,
  scope?: Scope,
): Promise<ChatMessageDto> {
  return runScoped(scope, async (s) => {
    const access = await authorizeGroup(userId, groupId, 'group.announcements.post', s.db);
    const row = await s.db.message.create({
      data: {
        groupId,
        authorMembershipId: access.membership.id,
        kind: 'TEXT',
        text,
        isAnnouncement: true,
      },
      include: messageInclude,
    });
    const message = toChatMessage(row);
    s.effects.add(() => emitToGroup(groupId, 'message.created', message));
    await notifyAnnouncement(s, {
      groupId,
      groupName: access.group.name,
      messageId: row.id,
      authorMembershipId: access.membership.id,
      text,
    });
    await audit(
      {
        action: 'chat.announcement.posted',
        actorUserId: userId,
        groupId,
        target: `Message:${row.id}`,
      },
      s.db,
    );
    return message;
  });
}

/**
 * Spec 4.4: the agent answers in the group as an AGENT message everyone can see (no author, no
 * notification). Called by the agent runtime; text is the agent's, already through the output guard.
 */
export async function postAgentMessage(
  groupId: string,
  text: string,
  scope?: Scope,
): Promise<ChatMessageDto> {
  return runScoped(scope, async (s) => {
    const row = await s.db.message.create({
      data: { groupId, kind: 'AGENT', text },
      include: messageInclude,
    });
    const message = toChatMessage(row);
    s.effects.add(() => emitToGroup(groupId, 'message.created', message));
    return message;
  });
}
