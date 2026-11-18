// The production dependencies of a turn: the model providers (or the test model), the tool registry, the
// PostgreSQL store, the session facts from the services, realtime to the member's room, the audit.
import { componentLogger } from '../../lib/logger';
import { audit } from '../../modules/audit';
import { agentConfig } from '../config';
import { agentError } from '../errors';
import { getLlm } from '../llm/provider';
import { userEmitter } from '../realtime';
import type { TurnDeps } from '../runtime/turn';
import { gatherSessionFacts } from '../session/facts';
import { dbConversationStore } from '../store/db-store';
import { summarizeConversation } from '../summarize';
import { productionRegistry } from '../tools/catalogue';
import type { AgentCtx } from '../types';

const log = componentLogger('agent');

export function productionDeps(ctx: AgentCtx): TurnDeps {
  const config = agentConfig();
  const llm = getLlm();
  if (!llm || !config.model) throw agentError('AGENT_NOT_CONFIGURED');
  return {
    llm,
    model: config.model,
    temperature: config.temperature,
    toolRouting: config.toolRouting,
    registry: productionRegistry(),
    store: dbConversationStore,
    sessionFacts: gatherSessionFacts,
    summarize: (previous, lines, lang, signal) =>
      summarizeConversation(previous, lines, lang, llm, signal),
    budget: { turnMs: config.turnBudgetMs, requestMs: config.requestTimeoutMs },
    emit: userEmitter(ctx.userId),
    audit: async (entry) => {
      try {
        await audit({ ...entry, actorUserId: ctx.userId, groupId: ctx.groupId });
      } catch (error) {
        log.error(
          { errorName: error instanceof Error ? error.name : 'unknown' },
          'agent audit failed',
        );
      }
    },
  };
}
