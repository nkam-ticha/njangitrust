// The agent's streamed reply, assembled in `seq` order (spec 2.8). Pure functions, no I/O: a delta that
// arrives early waits in the buffer until the gap before it is filled, and `reset` starts the text again.
import type { AgentDeltaPayload } from '@njangi/shared/contracts/agent';

/** What the agent is writing right now, from `agent.delta` and `agent.activity` (seq-ordered). */
export interface AgentStream {
  turnId: string | null;
  /** Streamed text by `seq`. */
  parts: Record<number, string>;
  /** First `seq` of the text on screen: 0, or the seq of the last reset. */
  start: number;
  /** The tool the agent is using (designer copy agent.activity.<tool>), or null. */
  tool: string | null;
}

/** The text of a stream: the parts from `start` up to the first missing `seq`, in order. */
export function streamText(stream: AgentStream | null): string {
  if (!stream) return '';
  let text = '';
  for (let seq = stream.start; stream.parts[seq] !== undefined; seq += 1) {
    text += stream.parts[seq];
  }
  return text;
}

/** Applies one delta. `reset` drops the parts streamed before it for this turn. */
export function applyDelta(
  stream: AgentStream | null,
  delta: AgentDeltaPayload,
): AgentStream | null {
  if (!stream) return null;
  if (stream.turnId !== null && stream.turnId !== delta.turnId) return stream;
  const kept: Record<number, string> = {};
  for (const [key, text] of Object.entries(stream.parts)) {
    if (delta.reset && Number(key) < delta.seq) continue;
    kept[Number(key)] = text;
  }
  kept[delta.seq] = delta.text;
  return {
    ...stream,
    turnId: delta.turnId,
    parts: kept,
    start: delta.reset ? delta.seq : stream.start,
  };
}
