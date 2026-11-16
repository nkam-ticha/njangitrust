// Results arrive in the conversation as system events (spec 4.5 step 5). Hooked on the existing
// `pendingAction.updated` path (WIRING LIST item 3) through a durable job (agent.jobs.ts): when an action the agent prepared reaches
// DONE, FAILED, CANCELLED or EXPIRED, the event is added once to the member's conversation and
// sent as `agent.done`; for DONE and FAILED the agent then says one short sentence about it. The
// agent says an action is done only from such an event.
import type { PendingActionUpdatedPayload } from '@njangi/shared/contracts/realtime';
import { toPendingAction } from '../../dto';
import { dispatchJob } from '../../jobs/dispatch';
import { componentLogger } from '../../lib/logger';
import { getSelfSource } from '../../modules/me';
import { getOwnPendingAction } from '../../modules/pending-actions';
import { agentConfig } from '../config';
import { tryConsumeAgentMessage } from '../guards/rate-limit';
import { withTurnLease } from '../guards/turn-lease';
import { toAgentMessage } from '../history';
import { emitAgent } from '../realtime';
import { eventText, isEventStatus } from '../runtime/events';
import { dbConversationStore } from '../store/db-store';
import { EVENT_TOOL } from '../store/types';
import { buildCtx } from './context';
import { privateTurn } from './turns';

const log = componentLogger('agent');

/** Records the event; returns whether the agent should react to it. */
async function recordEvent(userId: string, pendingActionId: string, status: string) {
  const payload = { id: pendingActionId };
  if (!isEventStatus(status)) return null;
  const preparing = await dbConversationStore.findPreparing(userId, payload.id);
  if (!preparing || (await dbConversationStore.hasEvent(preparing.conversationId, payload.id))) {
    return null;
  }
  const action = toPendingAction(await getOwnPendingAction(userId, payload.id));
  const text = eventText(action, status);
  const [row] = await dbConversationStore.append(preparing.conversationId, [
    {
      role: 'tool',
      toolName: EVENT_TOOL,
      toolStatus: status === 'DONE' ? 'OK' : status === 'FAILED' ? 'ERROR' : 'REFUSED',
      content: JSON.stringify({ pendingActionId: payload.id, status, text }),
    },
  ]);
  const self = await getSelfSource(userId);
  const lang = self.user.language;
  const conversation = await dbConversationStore.open({
    userId,
    channel: 'PRIVATE',
    groupId: null,
  });
  emitAgent(userId, 'agent.done', {
    id: row!.id,
    conversationId: preparing.conversationId,
    reply: toAgentMessage(row!, lang)!,
    actions: [action],
    cards: [],
    toolCalls: [],
    activeGroupId: conversation.groupId,
    language: lang,
  });
  return { status, conversation, lang };
}

async function react(userId: string, pendingActionId: string, status: string): Promise<void> {
  const recorded = await recordEvent(userId, pendingActionId, status);
  if (!recorded || (recorded.status !== 'DONE' && recorded.status !== 'FAILED')) return;
  if (!agentConfig().configured || !(await tryConsumeAgentMessage(userId))) return;
  const { conversation, lang } = recorded;
  const ctx = await buildCtx(
    { userId, lang, sessionId: 'agent-event', client: 'mobile' },
    { groupId: conversation.groupId, channel: 'PRIVATE', text: null },
  );
  await privateTurn(ctx, conversation, null);
}

export const ACTION_RESULT_JOB = 'agent.actionResult';
/** Short, so a job stays inside the cron run's 60 seconds: wait, then a 40 s turn at most. */
export const JOB_LEASE_WAIT_MS = 5_000;

export interface ActionResultJob {
  userId: string;
  pendingActionId: string;
  status: string;
}

/**
 * Called for every `pendingAction.updated`. Only queues a job (ids and the status): the agent's
 * sentence needs a model call, which must not run after a serverless response has been sent. The
 * job id makes a repeated update of the same action and status one job.
 */
export async function onPendingActionUpdated(
  userId: string,
  payload: PendingActionUpdatedPayload,
): Promise<void> {
  if (!isEventStatus(payload.status) || !agentConfig().configured) return;
  // Only actions the agent prepared have a result to tell in its conversation.
  if (!(await dbConversationStore.findPreparing(userId, payload.id))) return;
  const data: ActionResultJob = { userId, pendingActionId: payload.id, status: payload.status };
  await dispatchJob(ACTION_RESULT_JOB, { ...data }, { jobId: `${payload.id}:${payload.status}` });
}

/** The job: records the event once, then lets the agent say one sentence about it. */
export async function handleActionResult(job: ActionResultJob): Promise<void> {
  await withTurnLease(job.userId, () => react(job.userId, job.pendingActionId, job.status), {
    waitMs: JOB_LEASE_WAIT_MS,
  }).catch((error: unknown) => {
    log.error({ errorName: error instanceof Error ? error.name : 'unknown' }, 'agent event failed');
  });
}
