// An in-memory conversation store for the evaluation's scripted mode (no database).
import { randomUUID } from 'node:crypto';
import { clock } from '../../lib/clock';
import { EVENT_TOOL, type Conversation, type ConversationStore, type StoredMessage } from './types';

export class MemoryConversationStore implements ConversationStore {
  readonly conversations: Conversation[] = [];
  readonly messages: StoredMessage[] = [];
  private tick = 0;

  open(input: { userId: string; channel: Conversation['channel']; groupId: string | null }) {
    const found = this.conversations.find(
      (c) =>
        c.userId === input.userId &&
        c.channel === input.channel &&
        (input.channel === 'PRIVATE' || c.groupId === input.groupId),
    );
    if (found) return Promise.resolve(found);
    const created: Conversation = { id: randomUUID(), rollingSummary: null, ...input };
    this.conversations.push(created);
    return Promise.resolve(created);
  }

  setGroup(conversationId: string, groupId: string | null) {
    const c = this.conversations.find((x) => x.id === conversationId);
    if (c) c.groupId = groupId;
    return Promise.resolve();
  }

  setSummary(conversationId: string, summary: string) {
    const c = this.conversations.find((x) => x.id === conversationId);
    if (c) c.rollingSummary = summary;
    return Promise.resolve();
  }

  append(conversationId: string, messages: Parameters<ConversationStore['append']>[1]) {
    const stored = messages.map((m) => {
      this.tick += 1;
      const row: StoredMessage = {
        id: randomUUID(),
        conversationId,
        createdAt: new Date(clock.nowMs() + this.tick),
        role: m.role,
        content: m.content,
        toolName: m.toolName ?? null,
        toolArgsRedacted: m.toolArgsRedacted ?? null,
        toolStatus: m.toolStatus ?? null,
      };
      this.messages.push(row);
      return row;
    });
    return Promise.resolve(stored);
  }

  dialogue(conversationId: string, { limit, after }: { limit: number; after?: Date }) {
    const all = this.messages.filter(
      (m) =>
        m.conversationId === conversationId && (m.role !== 'tool' || m.toolName === EVENT_TOOL),
    );
    const lines = all.slice(-limit);
    const older = all
      .slice(0, Math.max(0, all.length - limit))
      .filter((m) => !after || m.createdAt > after);
    return Promise.resolve({ lines, older });
  }

  findPreparing(userId: string, pendingActionId: string) {
    const ids = new Set(this.conversations.filter((c) => c.userId === userId).map((c) => c.id));
    return Promise.resolve(
      this.messages.find(
        (m) =>
          m.role === 'tool' &&
          m.toolName !== EVENT_TOOL &&
          ids.has(m.conversationId) &&
          m.content.includes(pendingActionId),
      ) ?? null,
    );
  }

  hasEvent(conversationId: string, pendingActionId: string) {
    return Promise.resolve(
      this.messages.some(
        (m) =>
          m.conversationId === conversationId &&
          m.toolName === EVENT_TOOL &&
          m.content.includes(pendingActionId),
      ),
    );
  }
}
