// Query keys of the agent, and which realtime events belong to which group's thread. Pure, so it is
// tested: each group has its own private thread (history, summary, cards), and nothing from the
// thread of group A may land in the cache or on the screen of group B.

/** All threads (prefix): every invalidation of "the conversation" uses this and reaches each group. */
export const conversationPrefix = ['agent', 'conversation'] as const;

/** One group's thread. */
export const conversationKey = (groupId: string | null) =>
  ['agent', 'conversation', groupId ?? 'none'] as const;

/**
 * Whether an `agent.done` belongs to the thread the screen shows. `known` is the id of the thread
 * the screen has loaded; with none loaded yet the event is taken (the screen then reads its own
 * thread from the server, which answers for its group only).
 */
export function belongsToThread(known: string | null | undefined, eventConversationId: string) {
  return !known || known === eventConversationId;
}
