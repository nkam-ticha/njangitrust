// The PostgreSQL conversation store. One private conversation per member AND group, and one
// group-channel conversation per member and group: what the agent remembers never crosses groups.
import { clock } from '../../lib/clock';
import type { Prisma } from '../../lib/prisma';
import { getPrisma } from '../../lib/prisma';
import {
  EVENT_TOOL,
  type Conversation,
  type ConversationStore,
  type NewMessage,
  type StoredMessage,
} from './types';

const DIALOGUE = {
  OR: [
    { role: { in: ['user', 'assistant'] as ('user' | 'assistant')[] } },
    { toolName: EVENT_TOOL },
  ],
};

type Row = Prisma.AgentMessageGetPayload<object>;

function toStored(row: Row): StoredMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    createdAt: row.createdAt,
    role: row.role,
    content: row.content,
    toolName: row.toolName,
    toolArgsRedacted: (row.toolArgsRedacted as Record<string, unknown> | null) ?? null,
    toolStatus: row.toolStatus,
  };
}

function toConversation(row: Prisma.AgentConversationGetPayload<object>): Conversation {
  return {
    id: row.id,
    userId: row.userId,
    groupId: row.groupId,
    channel: row.channel,
    rollingSummary: row.rollingSummary,
  };
}

export const dbConversationStore: ConversationStore = {
  async open({ userId, channel, groupId }) {
    const db = getPrisma();
    // Exact match on the group, `null` included: a thread never serves another group.
    const existing = await db.agentConversation.findFirst({
      where: { userId, channel, groupId },
      orderBy: { createdAt: 'asc' },
    });
    const row =
      existing ?? (await db.agentConversation.create({ data: { userId, channel, groupId } }));
    return toConversation(row);
  },

  async get(userId, conversationId) {
    const row = await getPrisma().agentConversation.findFirst({
      where: { id: conversationId, userId },
    });
    return row ? toConversation(row) : null;
  },

  async latestPrivate(userId) {
    const db = getPrisma();
    // The thread of the newest line; a thread with no line yet falls back to the newest thread.
    const lastLine = await db.agentMessage.findFirst({
      where: { conversation: { userId, channel: 'PRIVATE' } },
      orderBy: { createdAt: 'desc' },
      select: { conversation: true },
    });
    const row =
      lastLine?.conversation ??
      (await db.agentConversation.findFirst({
        where: { userId, channel: 'PRIVATE' },
        orderBy: { createdAt: 'desc' },
      }));
    return row ? toConversation(row) : null;
  },

  async setSummary(conversationId, summary) {
    await getPrisma().agentConversation.update({
      where: { id: conversationId },
      data: { rollingSummary: summary },
    });
  },

  async append(conversationId, messages: NewMessage[]) {
    const db = getPrisma();
    const stored: StoredMessage[] = [];
    // One at a time with strictly increasing millisecond timestamps: createdAt then orders the
    // lines (user -> tool -> assistant) deterministically even on a sub-millisecond insert.
    let lastMs = 0;
    for (const message of messages) {
      const now = clock.nowMs();
      lastMs = now > lastMs ? now : lastMs + 1;
      const row = await db.agentMessage.create({
        data: {
          conversationId,
          createdAt: new Date(lastMs),
          role: message.role,
          content: message.content,
          toolName: message.toolName ?? null,
          ...(message.toolArgsRedacted
            ? { toolArgsRedacted: message.toolArgsRedacted as Prisma.InputJsonValue }
            : {}),
          toolStatus: message.toolStatus ?? null,
        },
      });
      stored.push(toStored(row));
    }
    return stored;
  },

  async dialogue(conversationId, { limit, after }) {
    const db = getPrisma();
    const recent = await db.agentMessage.findMany({
      where: { conversationId, ...DIALOGUE },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    const lines = recent.reverse().map(toStored);
    const first = lines[0];
    const older = first
      ? await db.agentMessage.findMany({
          where: {
            conversationId,
            ...DIALOGUE,
            createdAt: { lt: first.createdAt, ...(after ? { gt: after } : {}) },
          },
          orderBy: { createdAt: 'asc' },
          take: 200,
        })
      : [];
    return { lines, older: older.map(toStored) };
  },

  async findPreparing(userId, pendingActionId) {
    const row = await getPrisma().agentMessage.findFirst({
      where: {
        role: 'tool',
        NOT: { toolName: EVENT_TOOL },
        content: { contains: pendingActionId },
        conversation: { userId },
      },
    });
    return row ? toStored(row) : null;
  },

  async hasEvent(conversationId, pendingActionId) {
    const count = await getPrisma().agentMessage.count({
      where: { conversationId, toolName: EVENT_TOOL, content: { contains: pendingActionId } },
    });
    return count > 0;
  },
};
