// The agent keeps one thread per group: keys and events never mix them.
import { describe, expect, it } from 'vitest';
import { belongsToThread, conversationKey, conversationPrefix } from './keys';

describe('agent thread keys', () => {
  it('gives each group its own key, under one prefix', () => {
    const a = conversationKey('group-a');
    const b = conversationKey('group-b');
    expect(a).not.toEqual(b);
    for (const key of [a, b, conversationKey(null)]) {
      expect(key.slice(0, conversationPrefix.length)).toEqual([...conversationPrefix]);
    }
  });

  it('applies an agent.done only to the thread it belongs to', () => {
    expect(belongsToThread('thread-a', 'thread-a')).toBe(true);
    expect(belongsToThread('thread-a', 'thread-b')).toBe(false);
    expect(belongsToThread(null, 'thread-b')).toBe(true);
  });
});
