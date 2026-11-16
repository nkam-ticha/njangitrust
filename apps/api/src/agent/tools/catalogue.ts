// The production registry: every spec of the catalogue bound to exactly one implementation, each in
// the module that owns its service (or, for services not built yet, in tools/ported behind a port).
import { groupTools } from '../../modules/groups/groups.tools';
import { inviteTools } from '../../modules/invites/invites.tools';
import { meTools } from '../../modules/me/me.tools';
import { memberTools } from '../../modules/members/members.tools';
import { notificationTools } from '../../modules/notifications/notifications.tools';
import { proposalTools } from '../../modules/proposals/proposals.tools';
import { rulesetTools } from '../../modules/rulesets/rulesets.tools';
import { solidarityTools } from '../../modules/solidarity/solidarity.tools';
import { agentTools } from './agent.tools';
import { chatTools } from './ported/chat.tools';
import { meetingTools, statementAndAccountTools } from './ported/meetings.tools';
import { moneyTools } from './ported/money.tools';
import { ToolRegistry } from './registry';
import { ALL_SPECS } from './specs';
import type { Tool } from './types';

export const ALL_TOOLS: readonly Tool[] = [
  ...rulesetTools,
  ...memberTools,
  ...proposalTools,
  ...solidarityTools,
  ...meTools,
  ...notificationTools,
  ...groupTools,
  ...inviteTools,
  ...agentTools,
  ...moneyTools,
  ...chatTools,
  ...meetingTools,
  ...statementAndAccountTools,
];

let registry: ToolRegistry | null = null;

/** Builds the registry once; refuses to start with a spec left unimplemented. */
export function productionRegistry(): ToolRegistry {
  if (registry) return registry;
  const built = new ToolRegistry(ALL_TOOLS);
  const missing = ALL_SPECS.filter((spec) => !built.get(spec.name)).map((s) => s.name);
  if (missing.length)
    throw new Error(`Agent tools without an implementation: ${missing.join(', ')}`);
  registry = built;
  return built;
}
