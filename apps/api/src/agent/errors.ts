import { agentErrorTexts as t } from '@njangi/shared/i18n/server/agent';
import { defineErrors } from '../lib/errors';

export const agentError = defineErrors({
  AGENT_NOT_CONFIGURED: { status: 503, text: t.AGENT_NOT_CONFIGURED },
  AGENT_UNAVAILABLE: { status: 503, text: t.AGENT_UNAVAILABLE },
  AGENT_TURN_NOT_FOUND: { status: 404, text: t.AGENT_TURN_NOT_FOUND },
  NO_UPCOMING_MEETING: { status: 404, text: t.NO_UPCOMING_MEETING },
  ROUND_NOT_FOUND: { status: 404, text: t.ROUND_NOT_FOUND },
  NOTHING_TO_PAY: { status: 409, text: t.NOTHING_TO_PAY },
  MEETING_NOT_FOUND: { status: 404, text: t.MEETING_NOT_FOUND },
  MEMBER_NOT_FOUND: { status: 404, text: t.MEMBER_NOT_FOUND },
  MEMBER_AMBIGUOUS: { status: 409, text: t.MEMBER_AMBIGUOUS },
});
