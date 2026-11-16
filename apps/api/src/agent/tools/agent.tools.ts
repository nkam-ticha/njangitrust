// The agent's own tools: the member's agent history (spec 4.6, 4.10) and, in the group chat, the
// hand-off to the private conversation (spec 4.4).
import { formatDateTime } from '@njangi/shared';
import { listAgentHistory } from '../history';
import { ok } from './outcomes';
import { SPECS } from './specs';
import { implement } from './types';

export const agentTools = [
  implement(SPECS.get_agent_history, async (ctx) => {
    const { items } = await listAgentHistory(ctx.userId, { limit: 15 });
    return ok({
      history: items.map((i) => ({
        tool: i.tool,
        status: i.status,
        at: formatDateTime(i.createdAt, ctx.lang),
      })),
    });
  }),
  implement(SPECS.reply_privately, () =>
    Promise.resolve(ok({ answeredPrivately: true }, { privateReply: true })),
  ),
];
