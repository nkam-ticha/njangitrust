// @njangi in the group chat (spec 4.4). The chat module stores the message and calls
// `onGroupMention` with ids only (modules/chat/agent-port.ts). The agent answers in the group with
// group-visible reading tools only; a personal question or a request to act gets the group reply
// "Je t'ai répondu en privé, <prénom>." and continues in that member's private conversation.
import { agentTexts } from '@njangi/shared/i18n/server/agent';
import { bilingual } from '../../lib/texts';
import { componentLogger } from '../../lib/logger';
import { getSelfSource } from '../../modules/me';
import type { AuthActor } from '../../permissions';
import { agentConfig } from '../config';
import { tryConsumeAgentMessage } from '../guards/rate-limit';
import { withTurnLease } from '../guards/turn-lease';
import { dispatchJob } from '../../jobs/dispatch';
import { agentPorts } from '../ports';
import { looksPersonal } from '../runtime/personal';
import { dbConversationStore } from '../store/db-store';
import type { AgentCtx } from '../types';
import { buildCtx } from './context';
import { productionDeps } from './deps';
import { guardedTurn, privateTurn } from './turns';

const log = componentLogger('agent');
/** Short, so a job stays inside the cron run's 60 seconds: wait, then a 40 s turn at most. */
const LEASE_WAIT_MS = 5_000;

export interface GroupMention {
  groupId: string;
  messageId: string;
  authorUserId: string;
  authorMembershipId: string;
}

/** The author as an actor: the chat module authenticated them when they posted. */
async function authorActor(userId: string): Promise<AuthActor> {
  const self = await getSelfSource(userId);
  return { userId, lang: self.user.language, sessionId: 'group-mention', client: 'mobile' };
}

function privateReplyText(ctx: AgentCtx): string {
  return bilingual(agentTexts.privateReply, { name: ctx.firstName })[ctx.lang];
}

/** What the agent says in the group, and whether the member's private conversation continues. */
async function groupAnswer(
  ctx: AgentCtx,
  text: string,
): Promise<{ text: string; privately: boolean }> {
  if (looksPersonal(text)) return { text: privateReplyText(ctx), privately: true };
  const conversation = await dbConversationStore.open({
    userId: ctx.userId,
    channel: 'GROUP',
    groupId: ctx.groupId,
  });
  const result = await guardedTurn(productionDeps(ctx), { ctx, conversation, text });
  if (result.privateReply) return { text: privateReplyText(ctx), privately: true };
  return { text: result.reply, privately: false };
}

export const GROUP_MENTION_JOB = 'agent.groupMention';

/**
 * Called by the chat module when a message mentions @njangi. Only queues a job (ids, no text): the
 * answer needs model calls, which must not run after a serverless response has been sent.
 */
export async function onGroupMention(mention: GroupMention): Promise<void> {
  if (!agentPorts().chat || !agentConfig().configured) return;
  await dispatchJob(GROUP_MENTION_JOB, { ...mention }, { jobId: mention.messageId });
}

/** The job: answers the mention. A failure is logged and not retried (no double answer). */
export async function answerGroupMention(mention: GroupMention): Promise<void> {
  const chat = agentPorts().chat;
  if (!chat || !agentConfig().configured) return;
  const text = await chat.mentionText({
    groupId: mention.groupId,
    messageId: mention.messageId,
    userId: mention.authorUserId,
  });
  if (!text || !(await tryConsumeAgentMessage(mention.authorUserId))) return;
  const actor = await authorActor(mention.authorUserId);
  await withTurnLease(
    actor.userId,
    async () => {
      const ctx = await buildCtx(actor, { groupId: mention.groupId, channel: 'GROUP', text });
      const answer = await groupAnswer(ctx, text);
      await chat.postAgentReply({
        groupId: mention.groupId,
        text: answer.text,
        replyToMessageId: mention.messageId,
      });
      if (!answer.privately) return;
      const privateCtx = await buildCtx(actor, {
        groupId: mention.groupId,
        channel: 'PRIVATE',
        text,
      });
      const conversation = await dbConversationStore.open({
        userId: actor.userId,
        channel: 'PRIVATE',
        groupId: mention.groupId,
      });
      if (conversation.groupId !== mention.groupId) {
        await dbConversationStore.setGroup(conversation.id, mention.groupId);
        conversation.groupId = mention.groupId;
      }
      await privateTurn(privateCtx, conversation, text, { fromGroup: true });
    },
    { waitMs: LEASE_WAIT_MS },
  ).catch((error: unknown) => {
    log.error(
      { errorName: error instanceof Error ? error.name : 'unknown' },
      'group mention failed',
    );
  });
}
