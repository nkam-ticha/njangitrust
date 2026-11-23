// Messages the member has sent that the server has not confirmed yet (CHT-01). They live here, not
// in the message cache: a refetch replaces the cache with the server's list and would make a
// message that is still on its way vanish. The screen shows them below the server's messages, a
// failed one stays with a retry instead of disappearing, and a message the server already returned
// (by its id, through the answer, the poll or the realtime event) is shown once.
import { create } from 'zustand';
import type { ChatMessageDto } from '@njangi/shared/contracts/chat-messages';

export interface OutboxItem {
  /** The id the phone made; the server stores a message sent twice once. */
  id: string;
  groupId: string;
  text: string;
  replyTo: ChatMessageDto['replyTo'];
  author: { membershipId: string; name: string };
  createdAt: string;
  status: 'sending' | 'failed';
}

interface OutboxState {
  items: OutboxItem[];
  /** Messages that call @njangi and whose answer has not arrived: "Njangi écrit…". */
  agentWaiting: string[];
  add: (item: OutboxItem) => void;
  setStatus: (id: string, status: OutboxItem['status']) => void;
  remove: (id: string) => void;
  setAgentWaiting: (messageId: string, waiting: boolean) => void;
}

export const useOutbox = create<OutboxState>((set) => ({
  items: [],
  agentWaiting: [],
  add: (item) => set((s) => ({ items: [...s.items.filter((i) => i.id !== item.id), item] })),
  setStatus: (id, status) =>
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, status } : i)) })),
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  setAgentWaiting: (messageId, waiting) =>
    set((s) => {
      const has = s.agentWaiting.includes(messageId);
      if (waiting === has) return s;
      return {
        agentWaiting: waiting
          ? [...s.agentWaiting, messageId]
          : s.agentWaiting.filter((m) => m !== messageId),
      };
    }),
}));

/** An outbox item as a message the list can draw. */
export function outboxToMessage(item: OutboxItem): ChatMessageDto {
  return {
    id: item.id,
    groupId: item.groupId,
    author: item.author,
    kind: 'TEXT',
    text: item.text,
    createdAt: item.createdAt,
    attachment: null,
    replyTo: item.replyTo,
    mentions: [],
    isAnnouncement: false,
    removed: null,
    systemText: null,
  };
}

/**
 * The thread as the member sees it, newest first: their unconfirmed messages on top, then the
 * server's. A message already in the server's list is not drawn twice.
 */
export function mergeOutbox(
  server: readonly ChatMessageDto[],
  pending: readonly OutboxItem[],
): { messages: ChatMessageDto[]; status: Map<string, OutboxItem['status']> } {
  const known = new Set(server.map((m) => m.id));
  const status = new Map<string, OutboxItem['status']>();
  const local: ChatMessageDto[] = [];
  // Oldest first in the outbox; newest first in the list.
  for (const item of [...pending].reverse()) {
    if (known.has(item.id)) continue;
    status.set(item.id, item.status);
    local.push(outboxToMessage(item));
  }
  return { messages: [...local, ...server], status };
}

/** `@njangi` as a word of its own, any case (the server applies the same test). */
export function callsAgent(text: string): boolean {
  return /(^|[^A-Za-z0-9_@])@njangi(?![A-Za-z0-9_])/i.test(text);
}
