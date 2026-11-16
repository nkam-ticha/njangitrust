// Agent tool to start the first cycle (spec 4.6, GRP-02/03): the same START_CYCLE card as
// POST /groups/:id/cycles/start. Without the cycles module the handler refuses (UNAVAILABLE).
import { prepared } from '../../agent/tools/outcomes';
import { needGroup } from '../../agent/tools/resolve-group';
import { SPECS } from '../../agent/tools/specs';
import { implement } from '../../agent/tools/types';
import { createPendingAction } from '../pending-actions';

export const groupTools = [
  implement(SPECS.start_cycle, async (ctx) => {
    const noGroup = needGroup(ctx);
    if (noGroup) return noGroup;
    const action = await createPendingAction({
      userId: ctx.userId,
      groupId: ctx.groupId,
      lang: ctx.lang,
      origin: 'AGENT',
      type: 'START_CYCLE',
      args: { groupId: ctx.groupId },
    });
    return prepared(action, ctx.lang);
  }),
];
