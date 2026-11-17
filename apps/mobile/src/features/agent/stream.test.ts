// The streamed reply is assembled in seq order, whatever order the deltas arrive in (spec 2.8).
import { describe, expect, it } from 'vitest';
import type { AgentDeltaPayload } from '@njangi/shared/contracts/agent';
import { applyDelta, streamText, type AgentStream } from './stream';

const TURN = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

const start = (): AgentStream => ({ turnId: null, parts: {}, start: 0, tool: null });
const delta = (
  seq: number,
  text: string,
  extra: Partial<AgentDeltaPayload> = {},
): AgentDeltaPayload => ({
  turnId: TURN,
  seq,
  text,
  ...extra,
});

function play(deltas: AgentDeltaPayload[]): AgentStream | null {
  return deltas.reduce<AgentStream | null>((s, d) => applyDelta(s, d), start());
}

describe('the streamed reply (spec 2.8)', () => {
  it('joins deltas that arrive in order', () => {
    expect(streamText(play([delta(0, 'Bon'), delta(1, 'jour '), delta(2, 'Carine')]))).toBe(
      'Bonjour Carine',
    );
  });

  it('waits for the gap before applying a delta that arrives early', () => {
    const early = play([delta(1, 'jour')]);
    expect(streamText(early)).toBe('');
    expect(streamText(applyDelta(early, delta(0, 'Bon')))).toBe('Bonjour');
  });

  it('starts again from a reset, dropping the text streamed before it', () => {
    const after = play([
      delta(0, 'Brouillon'),
      delta(1, ' de réponse'),
      delta(2, 'Réponse', { reset: true }),
    ]);
    expect(streamText(after)).toBe('Réponse');
    expect(streamText(applyDelta(after, delta(3, ' finale')))).toBe('Réponse finale');
  });

  it('ignores deltas of another turn', () => {
    const stream = play([delta(0, 'Bonjour')]);
    expect(streamText(applyDelta(stream, { ...delta(0, 'autre'), turnId: OTHER }))).toBe('Bonjour');
  });

  it('shows nothing when no stream is open', () => {
    expect(streamText(applyDelta(null, delta(0, 'x')))).toBe('');
    expect(streamText(null)).toBe('');
  });
});
