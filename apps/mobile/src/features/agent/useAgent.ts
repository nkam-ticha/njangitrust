// The agent Njangi (spec 2.7 Agent, 2.8, 4.2 to 4.10). The reply comes complete in the HTTP response;
// `agent.delta` events only stream its text while it is written. Deltas are applied in `seq` order:
// a delta that arrives early waits in a buffer until the gap before it is filled.
import { useEffect, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  agentConversationSchema,
  agentHistorySchema,
  agentMessageRequestSchema,
  agentStatusSchema,
  agentTurnResponseSchema,
  type AgentDeltaPayload,
  type AgentConversationDto,
  type AgentMessageRequest,
  type AgentTurnDto,
} from '@njangi/shared/contracts/agent';
import { api } from '@/api/client';
import { applyDelta, type AgentStream } from './stream';
import { getSocket } from '@/api/socket';

export const agentKeys = {
  status: ['agent', 'status'] as const,
  conversation: ['agent', 'conversation'] as const,
  history: ['agent', 'history'] as const,
};

export function useAgentStatus() {
  return useQuery({
    queryKey: agentKeys.status,
    queryFn: () => api.get('/v1/agent/status', { schema: agentStatusSchema }),
    staleTime: 5 * 60_000,
  });
}

/** The member's private conversation, newest page first on the server; returned oldest first here. */
export function useAgentConversation() {
  const query = useInfiniteQuery({
    queryKey: agentKeys.conversation,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '30' });
      if (pageParam) params.set('before', pageParam);
      return api.get(`/v1/agent/conversation?${params.toString()}`, {
        schema: agentConversationSchema,
      });
    },
    getNextPageParam: (last) => last.nextBefore,
  });
  const pages = query.data?.pages ?? [];
  const messages = [...pages].reverse().flatMap((page) => page.messages);
  const conversation: AgentConversationDto['conversation'] = pages[0]?.conversation ?? null;
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

/** Subscribes to the agent's stream while a message is being answered. */
export function useAgentStream(active: boolean) {
  const [stream, setStream] = useState<AgentStream | null>(null);
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onDelta = (delta: AgentDeltaPayload) => setStream((s) => applyDelta(s, delta));
    const onActivity = (payload: { turnId: string; tool: string }) =>
      setStream((s) =>
        s && (s.turnId === null || s.turnId === payload.turnId)
          ? { ...s, turnId: payload.turnId, tool: payload.tool }
          : s,
      );
    socket.on('agent.delta', onDelta);
    socket.on('agent.activity', onActivity);
    return () => {
      socket.off('agent.delta', onDelta);
      socket.off('agent.activity', onActivity);
    };
  }, []);
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
    mutationFn: async (body: AgentMessageRequest): Promise<AgentTurnDto> =>
      (
        await api.post('/v1/agent/messages', agentMessageRequestSchema.parse(body), {
          schema: agentTurnResponseSchema,
        })
      ).turn,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: agentKeys.conversation });
      void qc.invalidateQueries({ queryKey: agentKeys.history });
    },
  });
}
