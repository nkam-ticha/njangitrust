// Where conversations live (spec 2.4 AgentConversation, AgentMessage; 4.3 history; 4.10). Content
// and tool arguments are always redacted before they reach a store (guards/redaction.ts).
import type { AgentChannel } from '@njangi/shared/contracts/agent';
import type { ToolCallStatus } from '../tools/execute';

/** The tool name of a stored action-result event (spec 4.5 step 5). */
export const EVENT_TOOL = 'action_result';
/** Marks a user line that came from an @njangi question in the group chat (spec 4.4). */
export const FROM_GROUP = 'from_group';

export interface Conversation {
  id: string;
  userId: string;
  groupId: string | null;
  channel: AgentChannel;
  rollingSummary: string | null;
}

export interface NewMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string | null;
  toolArgsRedacted?: Record<string, unknown> | null;
  toolStatus?: ToolCallStatus | null;
}

export interface StoredMessage extends Required<NewMessage> {
  id: string;
  conversationId: string;
  createdAt: Date;
}

export interface ConversationStore {
  /**
   * The member's conversation for this channel AND this group (null = no group): one thread per
   * group, each with its own history and rolling summary, created on first use.
   */
  open(input: {
    userId: string;
    channel: AgentChannel;
    groupId: string | null;
  }): Promise<Conversation>;
  /** One conversation by id (the member's own, or null). */
  get(userId: string, conversationId: string): Promise<Conversation | null>;
  /** The member's private thread used most recently: where a message with no group goes. */
  latestPrivate(userId: string): Promise<Conversation | null>;
  setSummary(conversationId: string, summary: string): Promise<void>;
  append(conversationId: string, messages: NewMessage[]): Promise<StoredMessage[]>;
  /** User, assistant and event lines, oldest first: the last `limit`, and how many came before. */
  dialogue(
    conversationId: string,
    options: { limit: number; after?: Date },
  ): Promise<{ lines: StoredMessage[]; older: StoredMessage[] }>;
  /** The tool row that prepared this pending action, if the agent did (for result events). */
  findPreparing(userId: string, pendingActionId: string): Promise<StoredMessage | null>;
  /** Whether a result event for this pending action is already in the conversation. */
  hasEvent(conversationId: string, pendingActionId: string): Promise<boolean>;
}

/** Rolling summary as stored: the text and the last line it covers. */
export interface RollingSummary {
  upTo: string;
  text: string;
}

export function readSummary(raw: string | null): RollingSummary | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RollingSummary>;
    return typeof parsed.upTo === 'string' && typeof parsed.text === 'string'
      ? { upTo: parsed.upTo, text: parsed.text }
      : null;
  } catch {
    return null;
  }
}
