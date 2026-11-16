// What the chat needs from the agent runtime (spec 4.4). The runtime does not exist yet, so this is
// a port, like the governance ports: the chat stores a message that writes `@njangi`, then tells
// the port; the runtime (Phase 4) registers itself here and answers in the group as an AGENT
// message, never discussing one member's personal situation or acting in the group.
import { componentLogger } from '../../lib/logger';

const log = componentLogger('chat');

/** A member wrote `@njangi` in the group chat. Ids only: the runtime reads the rest through services. */
export interface GroupMention {
  groupId: string;
  messageId: string;
  /** The member who asked, as the agent's `ctx` (spec 4.2: tools run as this member). */
  authorUserId: string;
  authorMembershipId: string;
}

export interface AgentPort {
  /** Called after the message is committed. A failure is logged and never undoes the message. */
  onGroupMention(mention: GroupMention): Promise<void>;
}

/** Until the agent runtime registers, a mention is stored and logged, nothing more. */
const noAgent: AgentPort = {
  onGroupMention(mention) {
    log.debug({ groupId: mention.groupId }, '@njangi mention stored: no agent runtime registered');
    return Promise.resolve();
  },
};

let port: AgentPort = noAgent;

export function registerAgentPort(next: AgentPort): void {
  port = next;
}

export function agentPort(): AgentPort {
  return port;
}

/** Tests only: back to the default. */
export function resetAgentPortForTests(): void {
  port = noAgent;
}

/** `@njangi` as a word of its own (not `a@njangi`, not `@njangiX`), any case. */
const AGENT_MENTION = /(?<![\p{L}\p{N}_@])@njangi(?![\p{L}\p{N}_])/iu;

export function mentionsAgent(text: string | null | undefined): boolean {
  return text ? AGENT_MENTION.test(text) : false;
}
