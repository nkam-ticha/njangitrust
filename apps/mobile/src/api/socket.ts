import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import type { ServerToClientEvents } from '@njangi/shared/contracts/realtime';
import { z } from 'zod';
import { useConnectivity } from '@/state/connectivity';
import { api } from './client';

type EventName = keyof ServerToClientEvents;
type EventHandler<E extends EventName> = ServerToClientEvents[E];

/** Compatibility surface for existing Socket.IO-style event consumers. */
export interface RealtimeEventClient {
  on<E extends EventName>(event: E, handler: EventHandler<E>): this;
  off<E extends EventName>(event: E, handler: EventHandler<E>): this;
  joinGroup(groupId: string): void;
  leaveGroup(groupId: string): void;
}

const supabaseUrl: string | undefined = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey: string | undefined = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const realtime = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  : null;

const realtimeTokenSchema = z.strictObject({
  token: z.string().min(1),
  expiresAt: z.string().datetime(),
  userId: z.string().uuid(),
  sessionId: z.string().uuid(),
});
const handlers = new Map<EventName, Set<(payload: unknown) => void>>();
const channels = new Map<string, RealtimeChannel>();
let client: RealtimeEventClient | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

interface RealtimeTokenCache {
  token: string;
  expiresAtMs: number;
  userId: string;
  sessionId: string;
}
let tokenCache: RealtimeTokenCache | null = null;
let tokenRequest: Promise<RealtimeTokenCache> | null = null;

async function realtimeToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAtMs > now + 30_000) return tokenCache.token;
  tokenRequest ??= api
    .get('/v1/auth/realtime-token', { schema: realtimeTokenSchema })
    .then((data) => {
      tokenCache = {
        token: data.token,
        expiresAtMs: new Date(data.expiresAt).getTime(),
        userId: data.userId,
        sessionId: data.sessionId,
      };
      return tokenCache;
    })
    .finally(() => {
      tokenRequest = null;
    });
  const issued = await tokenRequest;
  if (!issued) throw new Error('Realtime token unavailable');
  return issued.token;
}

function addChannel(topic: string): void {
  if (!realtime || channels.has(topic)) return;
  const nextChannel = realtime.channel(topic, { config: { private: true } });
  for (const event of [
    'message.created', 'message.deleted', 'message.hidden', 'proposal.updated',
    'notification.created', 'pendingAction.updated', 'session.ended',
  ] as const) {
    nextChannel.on('broadcast', { event }, ({ payload }) => {
      for (const handler of handlers.get(event) ?? []) handler(payload);
      if (event === 'session.ended') disconnectSocket();
    });
  }
  nextChannel.subscribe((status) => {
    if (status === 'SUBSCRIBED') useConnectivity.getState().markOnline();
    else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      useConnectivity.getState().markOffline();
    }
  });
  channels.set(topic, nextChannel);
}

function scheduleTokenRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  const delay = Math.max(10_000, (tokenCache?.expiresAtMs ?? Date.now()) - Date.now() - 30_000);
  refreshTimer = setTimeout(() => {
    realtimeToken()
      .then((token) => realtime?.realtime.setAuth(token))
      .then(() => scheduleTokenRefresh())
      .catch(() => useConnectivity.getState().markOffline());
  }, delay);
}

function removeChannel(): void {
  for (const channel of channels.values()) void realtime?.removeChannel(channel);
  channels.clear();
  handlers.clear();
  client = null;
  tokenCache = null;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
}

export function getSocket(): RealtimeEventClient | null {
  return client;
}

export async function connectSocket(): Promise<RealtimeEventClient | null> {
  if (client) return client;
  if (!realtime) {
    useConnectivity.getState().markOffline();
    return null;
  }

  try {
    await realtime.realtime.setAuth(await realtimeToken());
  } catch {
    useConnectivity.getState().markOffline();
    return null;
  }
  const nextClient: RealtimeEventClient = {
    on(event, handler) {
      const listeners = handlers.get(event) ?? new Set();
      listeners.add(handler as (payload: unknown) => void);
      handlers.set(event, listeners);
      return this;
    },
    off(event, handler) {
      handlers.get(event)?.delete(handler as (payload: unknown) => void);
      return this;
    },
    joinGroup(groupId) {
      if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(groupId)) addChannel(`group:${groupId}`);
    },
    leaveGroup(groupId) {
      const topic = `group:${groupId}`;
      const existing = channels.get(topic);
      if (existing) void realtime.removeChannel(existing);
      channels.delete(topic);
    },
  };
  client = nextClient;
  addChannel(`user:${tokenCache!.userId}`);
  addChannel(`session:${tokenCache!.sessionId}`);
  scheduleTokenRefresh();
  return client;
}

export function disconnectSocket(): void {
  removeChannel();
}
