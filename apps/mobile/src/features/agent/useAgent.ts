// The agent Njangi (spec 2.7 Agent, 2.8, 4.2 to 4.10). The reply comes complete in the HTTP response;
// `agent.delta` events only stream its text while it is written. Deltas are applied in `seq` order:
// a delta that arrives early waits in a buffer until the gap before it is filled.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useInfiniteQuery,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useAgentActivity, type AgentMode } from '@/state/agentActivity';
import {
  agentConversationSchema,
  agentHistorySchema,
  agentMessageRequestSchema,
  agentStatusSchema,
  agentTurnResponseSchema,
  type AgentDeltaPayload,
  type AgentConversationDto,
  type AgentDonePayload,
  type AgentMessageRequest,
  type AgentTurnDto,
} from '@njangi/shared/contracts/agent';
import { api } from '@/api/client';
import { getSocket } from '@/api/socket';
import { seedPendingActions } from '@/features/pendingActions/seed';
import { belongsToThread, conversationKey, conversationPrefix } from './keys';
import { applyDelta, type AgentStream } from './stream';

export const agentKeys = {
  status: ['agent', 'status'] as const,
  /** Prefix of every group's thread: use it to invalidate them all. */
  conversation: conversationPrefix,
  history: ['agent', 'history'] as const,
  send: ['agent', 'send'] as const,
};

/**
 * What the agent is doing for the whole app (orb and glow): what the Njangi tab reports while it is
 * open, and "thinking" for as long as a message is still being answered after the chat was closed.
 */
export function useAgentBusyMode(): AgentMode {
  const mode = useAgentActivity((s) => s.mode);
  const sending = useIsMutating({ mutationKey: agentKeys.send }) > 0;
  return mode !== 'idle' ? mode : sending ? 'thinking' : 'idle';
}

export function useAgentStatus() {
  return useQuery({
    queryKey: agentKeys.status,
    queryFn: () => api.get('/v1/agent/status', { schema: agentStatusSchema }),
    staleTime: 5 * 60_000,
  });
}

/**
 * The member's private thread with the agent in one group (each group has its own), newest page
 * first on the server; returned oldest first here.
 */
export function useAgentConversation(groupId: string | null) {
  const qc = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: conversationKey(groupId),
    enabled: !!groupId,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '30' });
      if (groupId) params.set('groupId', groupId);
      if (pageParam) params.set('before', pageParam);
      const page = await api.get(`/v1/agent/conversation?${params.toString()}`, {
        schema: agentConversationSchema,
      });
      // The cards of every reply (from the server) go into the card cache: they show their real
      // state at once and survive a reload, a tab change or the floating chat being closed.
      seedPendingActions(
        qc,
        page.messages.flatMap((m) => m.actions),
      );
      return page;
    },
    getNextPageParam: (last) => last.nextBefore,
    // Always read it fresh when the chat opens (a card may have been prepared by an @njangi mention
    // or finished meanwhile); poll gently only when no realtime connection brings `agent.done`.
    refetchOnMount: 'always',
    refetchInterval: () => (getSocket() ? false : 20_000),
  });
  // Re-derived only when the pages change, so a streamed delta does not rebuild the list.
  const messages = useMemo(
    () => [...(query.data?.pages ?? [])].reverse().flatMap((page) => page.messages),
    [query.data],
  );
  const conversation: AgentConversationDto['conversation'] =
    query.data?.pages[0]?.conversation ?? null;
  return { ...query, messages, conversation };
}

export function useAgentHistory() {
  return useInfiniteQuery({
    queryKey: agentKeys.history,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '30' });
      if (pageParam) params.set('before', pageParam);
      return api.get(`/v1/agent/history?${params.toString()}`, { schema: agentHistorySchema });
    },
    getNextPageParam: (last) => last.nextBefore,
  });
}
export { applyDelta, streamText, type AgentStream } from './stream';

/** Subscribes to the agent's stream while a message is being answered, and to its finished replies. */
export function useAgentStream(
  active: boolean,
  groupId: string | null,
  /** The id of the thread on screen, when loaded: events of another thread are ignored. */
  conversationId?: string | null,
) {
  const qc = useQueryClient();
  const [stream, setStream] = useState<AgentStream | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    // `agent.done` also announces a result event or a private reply to an @njangi mention: the cards
    // it carries are cached at once, and the conversation is read once (not once per event).
    const onDone = (turn: AgentDonePayload) => {
      seedPendingActions(qc, [...turn.actions, ...turn.reply.actions]);
      // Only the thread this screen shows is read again: another group's reply waits for its turn.
      if (!belongsToThread(conversationId, turn.conversationId)) return;
      clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: conversationKey(groupId) });
      }, 250);
    };
    const onDelta = (delta: AgentDeltaPayload) => setStream((s) => applyDelta(s, delta));
    const onActivity = (payload: { turnId: string; tool: string }) =>
      setStream((s) =>
        s && (s.turnId === null || s.turnId === payload.turnId)
          ? { ...s, turnId: payload.turnId, tool: payload.tool }
          : s,
      );
    socket.on('agent.delta', onDelta);
    socket.on('agent.activity', onActivity);
    socket.on('agent.done', onDone);
    return () => {
      clearTimeout(refreshTimer.current);
      socket.off('agent.delta', onDelta);
      socket.off('agent.activity', onActivity);
      socket.off('agent.done', onDone);
    };
  }, [qc, groupId, conversationId]);
  // A new answer starts with an empty stream; the end of an answer clears it.
  const [seen, setSeen] = useState(active);
  if (seen !== active) {
    setSeen(active);
    setStream(active ? { turnId: null, parts: {}, start: 0, tool: null } : null);
  }
  return { stream, reset: () => setStream(null) };
}

/** Sends a member's message. The reply (with its PendingAction cards) comes in the response. */
export function useSendAgentMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: agentKeys.send,
    mutationFn: async (body: AgentMessageRequest): Promise<AgentTurnDto> =>
      (
        await api.post('/v1/agent/messages', agentMessageRequestSchema.parse(body), {
          schema: agentTurnResponseSchema,
        })
      ).turn,
    onSuccess: (turn) => seedPendingActions(qc, turn.actions),
    onSettled: (_turn, _error, variables) => {
      void qc.invalidateQueries({ queryKey: conversationKey(variables.groupId ?? null) });
      // The history list only needs to be read again the next time it is opened.
      void qc.invalidateQueries({ queryKey: agentKeys.history, refetchType: 'none' });
    },
  });
}
