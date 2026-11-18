// Group chat (spec 1.5, 2.7 Chat, 2.8, CHT-01..02). Messages are paged newest first. The phone makes
// the message id, so a message sent twice is stored once (spec 1.7). Writes are never retried.
import { useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChatMessageDto } from '@njangi/shared/contracts/chat-messages';
import {
  chatStateSchema,
  chatUnreadAllSchema,
  messageListSchema,
  messageResponseSchema,
  MESSAGE_PAGE_SIZE,
} from '@njangi/shared/contracts/chat-messages';
import type { MessageDto } from '@njangi/shared/contracts/chat';
import { api } from '@/api/client';
import { getSocket } from '@/api/socket';

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

export function useMessages(groupId: string | null) {
  return useInfiniteQuery({
    queryKey: chatKeys.messages(groupId ?? 'none'),
    enabled: !!groupId,
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
  });
}

/** Unread messages across every group, for the Groupe tab badge. */
export function useUnreadTotal(): number {
  const { data } = useQuery({
    queryKey: chatKeys.unread,
    queryFn: () => api.get('/v1/chat/unread', { schema: chatUnreadAllSchema }),
    staleTime: 60_000,
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

export function useSendMessage(groupId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: string | { text: string; replyToId?: string | null }) => {
      const id = newMessageId();
      const payload = typeof input === 'string' ? { id, text: input } : { id, ...input };
      const res = await api.post(`/v1/groups/${groupId}/messages`, payload, {
        schema: messageResponseSchema,
      });
      return res.message;
    },
    onSuccess: (message) => {
      insertMessage(qc, groupId, message);
      if (groupId && message.text && /@njangi\b/i.test(message.text)) {
        void qc.invalidateQueries({ queryKey: chatKeys.messages(groupId) });
        void qc.invalidateQueries({ queryKey: ['agent'] });
        setTimeout(() => {
          void qc.invalidateQueries({ queryKey: chatKeys.messages(groupId) });
          void qc.invalidateQueries({ queryKey: ['agent'] });
        }, 3_500);
      }
    },
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
    const socket = getSocket();
    if (!socket || !groupId) return;
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
  }, [groupId, qc]);
}
