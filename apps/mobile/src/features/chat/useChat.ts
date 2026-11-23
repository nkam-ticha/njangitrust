// Group chat (spec 1.5, 2.7 Chat, 2.8, CHT-01..02). Messages are paged newest first. The phone makes
// the message id, so a message sent twice is stored once (spec 1.7). Writes are never retried
// automatically: a failed message stays in the outbox with a retry the member taps.
import { useCallback, useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChatMessageDto } from '@njangi/shared/contracts/chat-messages';
import {
  agentReplyResponseSchema,
  chatStateSchema,
  chatUnreadAllSchema,
  messageListSchema,
  messageResponseSchema,
  MESSAGE_PAGE_SIZE,
} from '@njangi/shared/contracts/chat-messages';
import type { MessageDto } from '@njangi/shared/contracts/chat';
import { api } from '@/api/client';
import { withSocket } from '@/api/socket';
import { callsAgent, useOutbox, type OutboxItem } from './outbox';

type Page = { messages: ChatMessageDto[]; nextBefore: string | null };
type Pages = { pages: Page[]; pageParams: (string | null)[] };

export const chatKeys = {
  messages: (groupId: string) => ['group', groupId, 'messages'] as const,
  state: (groupId: string) => ['group', groupId, 'chat'] as const,
  unread: ['chat', 'unread'] as const,
};

/** A UUID v4 for a client message id (the API accepts only UUIDs). */
export function newMessageId(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r % 4) + 8).toString(16);
  });
}

/** While a member waits for @njangi, the thread is read every second instead of every 2.5. */
const FAST_POLL_MS = 1000;
const POLL_MS = 2500;
const fastPollUntil = new Map<string, number>();

/** Reads the thread quickly for a while (after a message that calls the agent). */
export function boostPolling(groupId: string, forMs = 90_000): void {
  fastPollUntil.set(groupId, Date.now() + forMs);
}

const pollInterval = (groupId: string | null) =>
  groupId && (fastPollUntil.get(groupId) ?? 0) > Date.now() ? FAST_POLL_MS : POLL_MS;

const newestFirst = (a: ChatMessageDto, b: ChatMessageDto) =>
  a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1;

/**
 * Puts the newest page the server returned into the paged thread: messages already there are
 * replaced (a removal shows), new ones are added on top, and nothing the member scrolled to is lost.
 */
export function mergeLatest(
  qc: ReturnType<typeof useQueryClient>,
  groupId: string,
  latest: readonly ChatMessageDto[],
): void {
  const cached = qc.getQueryData<Pages>(chatKeys.messages(groupId));
  if (!cached || cached.pages.length === 0) return;
  const byId = new Map(latest.map((m) => [m.id, m]));
  const known = new Set<string>();
  const pages = cached.pages.map((p) => ({
    ...p,
    messages: p.messages.map((m) => {
      known.add(m.id);
      return byId.get(m.id) ?? m;
    }),
  }));
  const fresh = latest.filter((m) => !known.has(m.id));
  // A whole page of unseen messages: there may be a gap behind it, so read the thread again.
  if (fresh.length >= MESSAGE_PAGE_SIZE) {
    void qc.invalidateQueries({ queryKey: chatKeys.messages(groupId), exact: true });
    return;
  }
  const [first, ...rest] = pages;
  const next =
    fresh.length > 0 && first
      ? [{ ...first, messages: [...fresh, ...first.messages].sort(newestFirst) }, ...rest]
      : pages;
  qc.setQueryData<Pages>(chatKeys.messages(groupId), { ...cached, pages: next });
}

/**
 * The thread, newest first, paged back in time. It keeps itself current: the newest page is read
 * every 2.5 seconds (every second while the agent is answering), also when the tab is hidden or the
 * realtime link is down, and the realtime events (useChatRealtime) land in between.
 */
export function useMessages(groupId: string | null) {
  const qc = useQueryClient();
  useQuery({
    queryKey: [...chatKeys.messages(groupId ?? 'none'), 'latest'],
    enabled: !!groupId,
    networkMode: 'always',
    refetchInterval: () => pollInterval(groupId),
    refetchIntervalInBackground: true,
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      const page = await api.get(`/v1/groups/${groupId}/messages?limit=${MESSAGE_PAGE_SIZE}`, {
        schema: messageListSchema,
      });
      if (groupId) mergeLatest(qc, groupId, page.messages);
      return page.messages.length;
    },
  });
  return useInfiniteQuery({
    queryKey: chatKeys.messages(groupId ?? 'none'),
    enabled: !!groupId,
    networkMode: 'always',
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(MESSAGE_PAGE_SIZE) });
      if (pageParam) params.set('before', pageParam);
      return api.get(`/v1/groups/${groupId}/messages?${params.toString()}`, {
        schema: messageListSchema,
      });
    },
    getNextPageParam: (last) => last.nextBefore,
  });
}

/** Unread count, mentions and the last read time of one group (the marker of the unread line). */
export function useChatState(groupId: string | null) {
  return useQuery({
    queryKey: chatKeys.state(groupId ?? 'none'),
    enabled: !!groupId,
    queryFn: () => api.get(`/v1/groups/${groupId}/chat`, { schema: chatStateSchema }),
    refetchInterval: 5000,
  });
}

/** Unread messages across every group, for the Groupe tab badge. */
export function useUnreadTotal(): number {
  const { data } = useQuery({
    queryKey: chatKeys.unread,
    queryFn: () => api.get('/v1/chat/unread', { schema: chatUnreadAllSchema }),
    staleTime: 60_000,
    refetchInterval: 10_000,
  });
  return (data?.groups ?? []).reduce((sum, g) => sum + g.unread, 0);
}

export function useMarkRead(groupId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/v1/groups/${groupId}/read-marker`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chatKeys.state(groupId ?? 'none') });
      void qc.invalidateQueries({ queryKey: chatKeys.unread });
    },
  });
}

/**
 * Sends a message and shows it at once (CHT-01). The message goes to the outbox before the request
 * leaves, so it is on screen with no spinner and no wait; the server's copy takes its place when
 * the answer, the poll or the realtime event brings it. A failure keeps it in the list marked "Non
 * envoyé" with a retry (the same id, so a message that did arrive is not stored twice). A message
 * that calls @njangi then asks for the agent's answer in a request of its own: sending never waits
 * for the model.
 */
export function useSendMessage(
  groupId: string | null,
  authorInfo?: { membershipId?: string; name?: string } | null,
) {
  const qc = useQueryClient();
  const membershipId = authorInfo?.membershipId;
  const name = authorInfo?.name;

  const deliver = useCallback(
    async (item: OutboxItem) => {
      useOutbox.getState().setStatus(item.id, 'sending');
      try {
        const res = await api.post(
          `/v1/groups/${item.groupId}/messages`,
          {
            id: item.id,
            text: item.text,
            ...(item.replyTo ? { replyToId: item.replyTo.id } : {}),
          },
          { schema: messageResponseSchema },
        );
        // In the thread first, then out of the outbox: the message never blinks away in between.
        insertMessage(qc, item.groupId, res.message);
        useOutbox.getState().remove(item.id);
        if (callsAgent(item.text)) askAgent(qc, item.groupId, item.id);
      } catch {
        useOutbox.getState().setStatus(item.id, 'failed');
      }
    },
    [qc],
  );

  const send = useCallback(
    (input: { text: string; replyTo?: ChatMessageDto['replyTo'] }) => {
      if (!groupId || !membershipId) return;
      const item: OutboxItem = {
        id: newMessageId(),
        groupId,
        text: input.text,
        replyTo: input.replyTo ?? null,
        author: { membershipId, name: name ?? '' },
        createdAt: new Date().toISOString(),
        status: 'sending',
      };
      useOutbox.getState().add(item);
      if (callsAgent(item.text)) boostPolling(groupId);
      void deliver(item);
    },
    [deliver, groupId, membershipId, name],
  );

  const retry = useCallback(
    (id: string) => {
      const item = useOutbox.getState().items.find((i) => i.id === id);
      if (item && item.status === 'failed') void deliver(item);
    },
    [deliver],
  );

  const discard = useCallback((id: string) => useOutbox.getState().remove(id), []);

  return { send, retry, discard };
}

/**
 * Asks for the agent's answer to a message that calls @njangi. It runs in the background: the
 * answer appears in the thread through the poll and the realtime event, and "Njangi écrit…" shows
 * until the request ends. A failure is silent here (the member can ask again).
 */
function askAgent(qc: ReturnType<typeof useQueryClient>, groupId: string, messageId: string): void {
  useOutbox.getState().setAgentWaiting(messageId, true);
  boostPolling(groupId);
  api
    .post(
      `/v1/groups/${groupId}/messages/${messageId}/agent-reply`,
      {},
      { schema: agentReplyResponseSchema },
    )
    .catch(() => undefined)
    .finally(() => {
      useOutbox.getState().setAgentWaiting(messageId, false);
      void qc.invalidateQueries({ queryKey: [...chatKeys.messages(groupId), 'latest'] });
    });
}

export function useDeleteMessage(groupId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => api.delete(`/v1/messages/${messageId}`),
    onSuccess: (_data, messageId) => {
      markRemoved(qc, groupId, messageId, 'DELETED');
    },
  });
}

/** Puts a message on the first page (newest first), once. */
export function insertMessage(
  qc: ReturnType<typeof useQueryClient>,
  groupId: string | null,
  message: ChatMessageDto,
) {
  if (!groupId) return;
  qc.setQueryData<Pages>(chatKeys.messages(groupId), (old) => {
    if (!old) return old;
    const [first, ...rest] = old.pages;
    if (!first) return old;
    if (old.pages.some((p) => p.messages.some((m) => m.id === message.id))) return old;
    return { ...old, pages: [{ ...first, messages: [message, ...first.messages] }, ...rest] };
  });
}

function markRemoved(
  qc: ReturnType<typeof useQueryClient>,
  groupId: string | null,
  messageId: string,
  removed: 'DELETED' | 'HIDDEN',
) {
  if (!groupId) return;
  qc.setQueryData<Pages>(chatKeys.messages(groupId), (old) => {
    if (!old) return old;
    return {
      ...old,
      pages: old.pages.map((p) => ({
        ...p,
        messages: p.messages.map((m) =>
          m.id === messageId ? { ...m, text: null, attachment: null, removed } : m,
        ),
      })),
    };
  });
}

/** Live chat: new, deleted and hidden messages of the group (spec 2.8). */
export function useChatRealtime(groupId: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!groupId) return;
    // Waits for the realtime link when it is not up yet, and listens again after a reconnection.
    return withSocket((socket) => {
      socket.joinGroup(groupId);
      const onCreated = (message: MessageDto | ChatMessageDto) => {
        if (message.groupId !== groupId) return;
        insertMessage(qc, groupId, message as ChatMessageDto);
      };
      const onDeleted = (payload: { id: string; groupId: string }) => {
        if (payload.groupId === groupId) markRemoved(qc, groupId, payload.id, 'DELETED');
      };
      const onHidden = (payload: { id: string; groupId: string }) => {
        if (payload.groupId === groupId) markRemoved(qc, groupId, payload.id, 'HIDDEN');
      };
      socket.on('message.created', onCreated);
      socket.on('message.deleted', onDeleted);
      socket.on('message.hidden', onHidden);
      return () => {
        socket.off('message.created', onCreated);
        socket.off('message.deleted', onDeleted);
        socket.off('message.hidden', onHidden);
        socket.leaveGroup(groupId);
      };
    });
  }, [groupId, qc]);
}
