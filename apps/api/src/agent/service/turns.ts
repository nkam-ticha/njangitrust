// handleUserMessage (spec 4.2): a member's message in the private conversation, end to end. The
// acting member and their active group come from the authenticated session and can(); the reply
// streams to their own room and is returned with the cards to confirm (drawn from the server's
// PendingAction, spec 4.5). Nothing is kept in memory between requests: the conversation, the
// per-member turn lease and the message count all live in PostgreSQL.
import type { AgentTurnDto } from '@njangi/shared/contracts/agent';
import { toPendingAction } from '../../dto';
import { getOwnPendingAction } from '../../modules/pending-actions';
import type { AuthActor } from '../../permissions';
import { agentConfig } from '../config';
import { agentError } from '../errors';
import { consumeAgentMessage } from '../guards/rate-limit';
import { withTurnLease } from '../guards/turn-lease';
import { isLlmError } from '../llm/errors';
import { toAgentMessage } from '../history';
import { emitAgent } from '../realtime';
import { runTurn, type TurnDeps, type TurnResult } from '../runtime/turn';
import { dbConversationStore } from '../store/db-store';
import type { Conversation } from '../store/types';
import type { AgentCtx } from '../types';
import { buildCtx } from './context';
import { productionDeps } from './deps';

/** Model failures become the agent's stable "unavailable" answer; refusals pass through. */
export async function guardedTurn(deps: TurnDeps, input: Parameters<typeof runTurn>[1]) {
  try {
    return await runTurn(deps, input);
  } catch (error) {
    if (isLlmError(error))
      throw agentError('AGENT_UNAVAILABLE', { details: { reason: error.code } });
    throw error;
  }
}

export async function toTurnDto(
  ctx: AgentCtx,
  conversation: Conversation,
  result: TurnResult,
): Promise<AgentTurnDto> {
  const actions = await Promise.all(
    result.pendingActionIds.map(async (id) =>
      toPendingAction(await getOwnPendingAction(ctx.userId, id)),
    ),
  );
  return {
    id: ctx.turnId,
    conversationId: conversation.id,
    reply: toAgentMessage(result.replyMessage, ctx.lang)!,
    actions,
    cards: result.cards,
    toolCalls: result.runs.map((r) => ({ name: r.name, status: r.status })),
    activeGroupId: result.activeGroupId !== undefined ? result.activeGroupId : conversation.groupId,
    language: ctx.lang,
  };
}

/** Runs one private turn for a context already built, then announces it. */
export async function privateTurn(
  ctx: AgentCtx,
  conversation: Conversation,
  text: string | null,
  options: { fromGroup?: boolean } = {},
): Promise<AgentTurnDto> {
  const deps = productionDeps(ctx);
  const result = await guardedTurn(deps, { ctx, conversation, text, ...options });
  if (result.activeGroupId !== undefined && result.activeGroupId !== conversation.groupId) {
    await dbConversationStore.setGroup(conversation.id, result.activeGroupId);
    conversation.groupId = result.activeGroupId;
  }
  const dto = await toTurnDto(ctx, conversation, result);
  emitAgent(ctx.userId, 'agent.done', dto);
  return dto;
}

/**
 * POST /v1/agent/messages. `groupId`: undefined keeps the conversation's active group, null means
 * none, a group id switches to it (only if the member can read it).
 */
export async function handleUserMessage(
  actor: AuthActor,
  input: { text: string; groupId?: string | null },
): Promise<AgentTurnDto> {
  if (!agentConfig().configured) throw agentError('AGENT_NOT_CONFIGURED');
  await consumeAgentMessage(actor.userId);
  return withTurnLease(actor.userId, async () => {
    const conversation = await dbConversationStore.open({
      userId: actor.userId,
      channel: 'PRIVATE',
      groupId: input.groupId ?? null,
    });
    const groupId = input.groupId === undefined ? conversation.groupId : input.groupId;
    const ctx = await buildCtx(actor, { groupId, channel: 'PRIVATE', text: input.text });
    if (conversation.groupId !== groupId) {
      await dbConversationStore.setGroup(conversation.id, groupId);
      conversation.groupId = groupId;
    }
    return privateTurn(ctx, conversation, input.text);
  });
}
