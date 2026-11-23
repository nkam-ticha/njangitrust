// Public surface of the agent runtime (spec Part 4). Other modules register their ports here; the
// HTTP router mounts `agentRoutes`; the chat calls `onGroupMention`; the pending-actions path calls
// `onPendingActionUpdated`. Nothing exported here can confirm a PendingAction.
export { agentRoutes } from './agent.routes';
export { agentHealth, agentStatus } from './status';
export { handleUserMessage } from './service/turns';
export {
  answerGroupMentionNow,
  onGroupMention,
  type GroupMention,
  type MentionOutcome,
} from './service/group';
export { onPendingActionUpdated } from './service/events';
export { registerAgentJobs } from './agent.jobs';
export { registerAgentAdapters } from './adapters';
export {
  registerAgentPorts,
  type AgentAccountPort,
  type AgentChatPort,
  type AgentData,
  type AgentMeetingsPort,
  type AgentMoneyPort,
  type AgentPorts,
  type AgentStatementsPort,
  type SessionMoneyLines,
  type UnreadSource,
} from './ports';
export type { AgentCtx } from './types';
