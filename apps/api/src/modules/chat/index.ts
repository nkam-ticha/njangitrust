// Public surface of the chat module (other modules import only from here).
export { postSystemMessage } from './chat.service';
export {
  deleteMessage,
  hideMessage,
  listMessages,
  postAgentMessage,
  postAnnouncement,
  requestAgentReply,
  sendMessage,
  type SendResult,
} from './chat.messages';
export {
  getChatState,
  getChatStates,
  markChatRead,
  muteChat,
  summarizeUnread,
  SUMMARY_MAX_MESSAGES,
  type SummaryMessage,
  type UnreadSummary,
} from './chat.read';
export {
  chatAnnounceHandler,
  chatHideHandler,
  chatPostHandler,
  requestAnnouncement,
  requestHide,
  requestPost,
} from './chat.actions';
export { chatGroupRoutes, chatMessageRoutes, chatUnreadRoutes } from './chat.routes';
export {
  agentPort,
  mentionsAgent,
  registerAgentPort,
  type AgentPort,
  type GroupMention,
  type MentionAnswer,
} from './agent-port';
export { runScoped, type Scope } from './scope';
