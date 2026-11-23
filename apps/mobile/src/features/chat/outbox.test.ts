// The thread a member sees: their unconfirmed messages on top, never twice, failures kept.
import { describe, expect, it } from 'vitest';
import type { ChatMessageDto } from '@njangi/shared/contracts/chat-messages';
import { callsAgent, mergeOutbox, type OutboxItem } from './outbox';

const message = (id: string, createdAt: string): ChatMessageDto => ({
  id,
  groupId: 'g',
  author: { membershipId: 'm1', name: 'Carine' },
  kind: 'TEXT',
  text: id,
  createdAt,
  attachment: null,
  replyTo: null,
  mentions: [],
  isAnnouncement: false,
  removed: null,
  systemText: null,
});

const item = (id: string, status: OutboxItem['status']): OutboxItem => ({
  id,
  groupId: 'g',
  text: `text ${id}`,
  replyTo: null,
  author: { membershipId: 'm2', name: 'Paul' },
  createdAt: '2026-11-22T10:00:00.000Z',
  status,
});

describe('mergeOutbox', () => {
  it('puts unconfirmed messages on top of the server list, newest first', () => {
    const server = [
      message('s2', '2026-11-22T09:59:00.000Z'),
      message('s1', '2026-11-22T09:58:00.000Z'),
    ];
    const merged = mergeOutbox(server, [item('a', 'sending'), item('b', 'failed')]);
    expect(merged.messages.map((m) => m.id)).toEqual(['b', 'a', 's2', 's1']);
    expect(merged.status.get('a')).toBe('sending');
    expect(merged.status.get('b')).toBe('failed');
  });

  it('shows a message once when the server already returned it (poll or realtime first)', () => {
    const server = [message('a', '2026-11-22T10:00:01.000Z')];
    const merged = mergeOutbox(server, [item('a', 'sending')]);
    expect(merged.messages.map((m) => m.id)).toEqual(['a']);
    expect(merged.status.has('a')).toBe(false);
  });

  it('keeps a failed message in the list instead of dropping it', () => {
    const merged = mergeOutbox([], [item('a', 'failed')]);
    expect(merged.messages).toHaveLength(1);
    expect(merged.messages[0]).toMatchObject({ id: 'a', text: 'text a', author: { name: 'Paul' } });
  });
});

describe('callsAgent', () => {
  it('matches @njangi as a word of its own, any case', () => {
    expect(callsAgent('@njangi qui doit payer ?')).toBe(true);
    expect(callsAgent('Salut @Njangi')).toBe(true);
    expect(callsAgent('a@njangi.org')).toBe(false);
    expect(callsAgent('@njangiX')).toBe(false);
    expect(callsAgent('njangi')).toBe(false);
  });
});
