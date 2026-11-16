// The member's own conversation and "Historique de l'assistant" (spec 4.10, FSD AGT-09). Only the
// owner reads them: every query is scoped to the authenticated user; nobody else, the admin
// included, has a path to another member's agent history.
import type { Lang } from '@njangi/shared';
import type { AgentHistoryItemDto, AgentMessageDto } from '@njangi/shared/contracts/agent';
import { iso } from '../dto';
import { getPrisma } from '../lib/prisma';
import { authorizeOwner } from '../permissions';
import { readEvent } from './runtime/messages';
import { EVENT_TOOL, FROM_GROUP, type StoredMessage } from './store/types';
import { SPECS } from './tools/specs';

const PAGE = 50;

function cursor(before: string | undefined) {
  return before ? { createdAt: { lt: new Date(before) } } : {};
}

export function toAgentMessage(row: StoredMessage, lang: Lang): AgentMessageDto | null {
  if (row.role === 'tool') {
    if (row.toolName !== EVENT_TOOL) return null;
    const event = readEvent(row.content);
    if (!event) return null;
    return {
      id: row.id,
      role: 'event',
      text: event.text[lang],
      fromGroup: false,
      event: {
        pendingActionId: event.pendingActionId,
        status: event.status as NonNullable<AgentMessageDto['event']>['status'],
      },
      createdAt: iso(row.createdAt),
    };
  }
  return {
    id: row.id,
    role: row.role,
    text: row.content,
    fromGroup: row.role === 'user' && row.toolName === FROM_GROUP,
    event: null,
    createdAt: iso(row.createdAt),
  };
}

export async function getOwnConversation(
  userId: string,
  lang: Lang,
  query: { before?: string; limit?: number },
) {
  const db = getPrisma();
  const conversation = await db.agentConversation.findFirst({
    where: { userId, channel: 'PRIVATE' },
    orderBy: { createdAt: 'asc' },
  });
  if (!conversation) return { conversation: null, messages: [], nextBefore: null };
  authorizeOwner(userId, 'agent.history.read', conversation.userId);
  const limit = query.limit ?? PAGE;
  const rows = await db.agentMessage.findMany({
    where: {
      conversationId: conversation.id,
      OR: [{ role: { in: ['user', 'assistant'] } }, { toolName: EVENT_TOOL }],
      ...cursor(query.before),
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  const messages = page
    .reverse()
    .map((row) => toAgentMessage(row as StoredMessage, lang))
    .filter((m): m is AgentMessageDto => m !== null);
  return {
    conversation: {
      id: conversation.id,
      groupId: conversation.groupId,
      channel: conversation.channel,
    },
    messages,
    nextBefore: rows.length > limit ? iso(page[0]!.createdAt) : null,
  };
}

const ACTION_STATUS: Record<string, AgentHistoryItemDto['status']> = {
  PENDING: 'prepared',
  CONFIRMED: 'confirmed',
  DONE: 'done',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  FAILED: 'failed',
};

function pendingIdOf(content: string): string | null {
  try {
    const id = (JSON.parse(content) as { pendingActionId?: unknown }).pendingActionId;
    return typeof id === 'string' ? id : null;
  } catch {
    return null;
  }
}

export async function listAgentHistory(
  userId: string,
  query: { before?: string; limit?: number },
): Promise<{ items: AgentHistoryItemDto[]; nextBefore: string | null }> {
  const db = getPrisma();
  const limit = query.limit ?? PAGE;
  const rows = await db.agentMessage.findMany({
    where: {
      role: 'tool',
      NOT: { toolName: EVENT_TOOL },
      conversation: { userId },
      ...cursor(query.before),
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  const ids = page.flatMap((r) => {
    const id = pendingIdOf(r.content);
    return id ? [id] : [];
  });
  const actions = ids.length
    ? await db.pendingAction.findMany({
        where: { id: { in: ids }, userId },
        select: { id: true, status: true },
      })
    : [];
  const statusById = new Map(actions.map((a) => [a.id, a.status]));
  const items = page.map((row): AgentHistoryItemDto => {
    const pendingActionId = pendingIdOf(row.content);
    const spec = (SPECS as Record<string, { level: string }>)[row.toolName ?? ''];
    let status: AgentHistoryItemDto['status'] = 'looked';
    if (row.toolStatus === 'REFUSED') status = 'refused';
    else if (row.toolStatus !== 'OK') status = 'failed';
    else if (pendingActionId) status = ACTION_STATUS[statusById.get(pendingActionId) ?? 'PENDING']!;
    else if (spec && spec.level !== 'L0') status = 'prepared';
    return {
      id: row.id,
      tool: row.toolName ?? '',
      status,
      pendingActionId,
      createdAt: iso(row.createdAt),
    };
  });
  return { items, nextBefore: rows.length > limit ? iso(page[page.length - 1]!.createdAt) : null };
}
