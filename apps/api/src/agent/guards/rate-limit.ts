// Spec 4.2: 30 messages per member per 10 minutes (shared PostgreSQL counters in production, so
// every serverless instance sees the same count; memory in tests and local development), and at
// most 8 tool steps per message. A refusal is a 429 with a bilingual message giving the time the
// member can write again, in Douala time.
import { formatClock } from '@njangi/shared';
import { agentErrorTexts } from '@njangi/shared/i18n/server/agent';
import { RateLimiterRes } from 'rate-limiter-flexible';
import { lazyLimiter } from '../../http/rate-limit';
import { clock } from '../../lib/clock';
import { defineErrors } from '../../lib/errors';

export const MESSAGE_LIMIT = 30;
export const MESSAGE_WINDOW_SECONDS = 600;
export const MAX_TOOL_STEPS = 8;

const agentLimitError = defineErrors({
  AGENT_RATE_LIMITED: { status: 429, text: agentErrorTexts.AGENT_RATE_LIMITED },
});

export const agentMessageLimiter = lazyLimiter({
  name: 'agent-messages',
  points: MESSAGE_LIMIT,
  durationSeconds: MESSAGE_WINDOW_SECONDS,
});

/** Counts one member message, or throws AGENT_RATE_LIMITED. */
export async function consumeAgentMessage(userId: string): Promise<void> {
  try {
    await agentMessageLimiter.get().consume(userId);
  } catch (error) {
    if (!(error instanceof RateLimiterRes)) throw error;
    const seconds = Math.max(1, Math.ceil(error.msBeforeNext / 1000));
    const at = new Date(clock.nowMs() + seconds * 1000);
    throw agentLimitError('AGENT_RATE_LIMITED', {
      params: { time: { fr: formatClock(at, 'fr'), en: formatClock(at, 'en') } },
      details: { retryAfterSeconds: seconds },
    });
  }
}

/** Follow-up turns (an action's result) never refuse: they count only if points are left. */
export async function tryConsumeAgentMessage(userId: string): Promise<boolean> {
  try {
    await agentMessageLimiter.get().consume(userId);
    return true;
  } catch {
    return false;
  }
}
