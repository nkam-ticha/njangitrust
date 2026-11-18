// The agent's own tools: the member's agent history (spec 4.6, 4.10), the guide to the app
// (docs/DECISIONS.md: an addition to spec 4.6) and, in the group chat, the hand-off to the private
// conversation (spec 4.4).
import { formatDateTime } from '@njangi/shared';
import { listAgentHistory } from '../history';
import { findGuideEntry, guideIndex } from '../knowledge/app-guide';
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
  implement(SPECS.get_app_guide, (ctx, args) => {
    const entry = args.topic ? findGuideEntry(args.topic) : null;
    if (!entry) {
      return Promise.resolve(
        ok({
          topics: guideIndex(ctx.lang),
          note:
            ctx.lang === 'fr'
              ? 'Choisis le sujet le plus proche de la question et rappelle l’outil avec son identifiant.'
              : 'Pick the topic closest to the question and call the tool again with its id.',
        }),
      );
    }
    return Promise.resolve(
      ok({ topic: entry.id, title: entry.title[ctx.lang], guide: entry.text[ctx.lang] }),
    );
  }),
  implement(SPECS.reply_privately, () =>
    Promise.resolve(ok({ answeredPrivately: true }, { privateReply: true })),
  ),
];
