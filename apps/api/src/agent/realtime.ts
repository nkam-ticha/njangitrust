// The agent's events, to the member's own room only (spec 2.8): `agent.delta`, `agent.activity`,
// `agent.done`. They go through the realtime emitter, whatever carries it (Supabase Realtime
// Broadcast in production, Socket.IO on a local server).
//
// Each broadcast is one HTTP call, so streamed text is coalesced: at most one `agent.delta` every
// DELTA_INTERVAL_MS, numbered with `seq`. Streaming is a comfort; the complete reply is always in
// the HTTP response and in `agent.done`.
import type { AgentServerEvents } from '@njangi/shared/contracts/agent';
import { clock } from '../lib/clock';
import { emitToUser } from '../realtime/emitter';
import type { TurnEmitter } from './runtime/turn';

export const DELTA_INTERVAL_MS = 400;

type AgentEvent = keyof AgentServerEvents;

export function emitAgent<E extends AgentEvent>(
  userId: string,
  event: E,
  payload: Parameters<AgentServerEvents[E]>[0],
): void {
  emitToUser(userId, event, payload);
}

/** A turn's emitter. It lives for one turn only: nothing is kept between requests. */
export function userEmitter(
  userId: string,
  nowMs: () => number = () => clock.nowMs(),
): TurnEmitter {
  let seq = 0;
  let buffer = '';
  let lastFlush: number | null = null;
  const send = (turnId: string, text: string, reset?: boolean) => {
    emitAgent(userId, 'agent.delta', { turnId, seq, text, ...(reset ? { reset } : {}) });
    seq += 1;
    lastFlush = nowMs();
  };
  return {
    delta: ({ turnId, text, reset }) => {
      if (reset) {
        buffer = '';
        send(turnId, '', true);
        return;
      }
      buffer += text;
      if (lastFlush !== null && nowMs() - lastFlush < DELTA_INTERVAL_MS) return;
      send(turnId, buffer);
      buffer = '';
    },
    flush: (turnId) => {
      if (!buffer) return;
      send(turnId, buffer);
      buffer = '';
    },
    activity: (payload) => emitAgent(userId, 'agent.activity', payload),
  };
}
