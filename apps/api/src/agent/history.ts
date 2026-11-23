// The member's own conversation and "Historique de l'assistant" (spec 4.10, FSD AGT-09). Only the
// owner reads them: every query is scoped to the authenticated user; nobody else, the admin
// included, has a path to another member's agent history.
import type { Lang } from '@njangi/shared';
import type { AgentHistoryItemDto, AgentMessageDto } from '@njangi/shared/contracts/agent';
import type { PendingActionDto } from '@njangi/shared/contracts/pending-actions';
import { iso, toPendingAction } from '../dto';
import { getPrisma } from '../lib/prisma';
import { listOwnOpenAgentActions, listOwnPendingActions } from '../modules/pending-actions';
import { authorizeOwner } from '../permissions';
import { readEvent } from './runtime/messages';
import { dbConversationStore } from './store/db-store';
import { EVENT_TOOL, FROM_GROUP, type StoredMessage } from './store/types';
import { SPECS } from './tools/specs';

const PAGE = 50;

function cursor(before: string | undefined) {
  return before ? { createdAt: { lt: new Date(before) } } : {};
}

export function toAgentMessage(
  row: StoredMessage,
  lang: Lang,
  actions: PendingActionDto[] = [],
): AgentMessageDto | null {
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
      actions: [],
      createdAt: iso(row.createdAt),
    };
  }
  return {
    id: row.id,
    role: row.role,
    text: row.content,
    fromGroup: row.role === 'user' && row.toolName === FROM_GROUP,
    event: null,
    actions: row.role === 'assistant' ? actions : [],
    createdAt: iso(row.createdAt),
  };
}

/**
 * The cards of each assistant line: a turn stores its tool rows between the member's line and the
 * reply (store/types.ts append order), and a tool row that prepared a card holds its id. Lines are
 * oldest first; `after` is the createdAt of the line just before them (null at the start).
 */
async function cardIdsByReply(
  conversationId: string,
  lines: { id: string; role: string; createdAt: Date }[],
  after: Date | null,
): Promise<Map<string, string[]>> {
  const byReply = new Map<string, string[]>();
  const last = lines[lines.length - 1];
  if (!last || !lines.some((l) => l.role === 'assistant')) return byReply;
  const toolRows = await getPrisma().agentMessage.findMany({
    where: {
      conversationId,
      role: 'tool',
      NOT: { toolName: EVENT_TOOL },
      content: { not: '' },
      createdAt: { ...(after ? { gt: after } : {}), lte: last.createdAt },
    },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true, content: true },
  });
  let previous = after?.getTime() ?? Number.NEGATIVE_INFINITY;
  for (const line of lines) {
    if (line.role === 'assistant') {
      const ids = toolRows.flatMap((row) => {
        const at = row.createdAt.getTime();
        const id = at > previous && at < line.createdAt.getTime() ? pendingIdOf(row.content) : null;
        return id ? [id] : [];
      });
      if (ids.length) byReply.set(line.id, ids);
    }
    previous = line.createdAt.getTime();
  }
  return byReply;
}

/**
 * Open cards of this group's thread that no stored tool row names. Cards a tool row names are drawn
 * under their own reply (on this page or an older one) and are never repeated here.
 */
async function looseCards(
  userId: string,
  conversation: { id: string; groupId: string | null },
): Promise<PendingActionDto[]> {
  // Only this group's cards: another group's open card belongs in that group's thread.
  const open = (await listOwnOpenAgentActions(userId)).filter(
    (a) => a.groupId === conversation.groupId,
  );
  if (open.length === 0) return [];
  const named = await getPrisma().agentMessage.findMany({
    where: {
      conversationId: conversation.id,
      role: 'tool',
      NOT: { toolName: EVENT_TOOL },
      OR: open.map((a) => ({ content: { contains: a.id } })),
    },
    select: { content: true },
  });
  const text = named.map((row) => row.content).join(' ');
  return open.filter((a) => !text.includes(a.id)).map((a) => toPendingAction(a));
}

export async function getOwnConversation(
  userId: string,
  lang: Lang,
  query: { before?: string; limit?: number; groupId?: string },
  only?: { conversationId: string },
) {
  const db = getPrisma();
  // One conversation per group: the one asked for (by id, or by group), else the one used last.
  const conversation = only
    ? await db.agentConversation.findFirst({ where: { id: only.conversationId, userId } })
    : query.groupId
      ? await db.agentConversation.findFirst({
          where: { userId, channel: 'PRIVATE', groupId: query.groupId },
          orderBy: { createdAt: 'asc' },
        })
      : await dbConversationStore.latestPrivate(userId);
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
  const oldestFirst = [...page].reverse();
  const ids = await cardIdsByReply(
    conversation.id,
    oldestFirst,
    rows.length > limit ? rows[limit]!.createdAt : null,
  );
  const cards = new Map(
    (await listOwnPendingActions(userId, [...ids.values()].flat())).map((a) => [
      a.id,
      toPendingAction(a),
    ]),
  );
  const cardsOf = (id: string) => (ids.get(id) ?? []).flatMap((c) => cards.get(c) ?? []);
  // Cards the member can still tap that no stored tool row names (a secret ballot's turn keeps no
  // link to its card, R11.5; or a turn cut short after preparing) ride on the newest reply.
  const newestReply = query.before
    ? undefined
    : oldestFirst.findLast((r) => r.role === 'assistant');
  const loose = newestReply ? await looseCards(userId, conversation) : [];
  const messages = oldestFirst
    .map((row) =>
      toAgentMessage(row as StoredMessage, lang, [
        ...cardsOf(row.id),
        ...(row.id === newestReply?.id ? loose : []),
      ]),
    )
    .filter((m): m is AgentMessageDto => m !== null);
  return {
    conversation: {
      id: conversation.id,
      groupId: conversation.groupId,
      channel: conversation.channel,
    },
    messages,
    nextBefore: rows.length > limit ? iso(page[page.length - 1]!.createdAt) : null,
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
  query: { before?: string; limit?: number; groupId?: string },
): Promise<{ items: AgentHistoryItemDto[]; nextBefore: string | null }> {
  const db = getPrisma();
  const limit = query.limit ?? PAGE;
  const rows = await db.agentMessage.findMany({
    where: {
      role: 'tool',
      NOT: { toolName: EVENT_TOOL },
      conversation: { userId, ...(query.groupId ? { groupId: query.groupId } : {}) },
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
