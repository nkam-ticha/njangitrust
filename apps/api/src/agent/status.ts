// What the agent can do on this server (GET /v1/agent/status, /health `agent`). Configuration is
// checked without calling the provider; the key itself is never returned or logged.
import type { AgentStatusDto } from '@njangi/shared/contracts/agent';
import { agentErrorTexts } from '@njangi/shared/i18n/server/agent';
import { moneyOperation } from '../modules/proposals';
import { agentConfig } from './config';
import { hasPort } from './ports';

export function agentStatus(): AgentStatusDto {
  const config = agentConfig();
  return {
    configured: config.configured,
    message: config.configured ? null : { ...agentErrorTexts.AGENT_NOT_CONFIGURED },
    toolRouting: config.toolRouting,
    capabilities: {
      money: hasPort('money'),
      cycles: moneyOperation('startCycle') !== null,
      chat: hasPort('chat'),
      meetings: hasPort('meetings'),
      statements: hasPort('statements'),
      account: hasPort('account'),
    },
  };
}

/** /health: `up` when configured, `not_configured` otherwise (never `down`: the app works without it). */
export function agentHealth(): Promise<'up' | 'not_configured'> {
  return Promise.resolve(agentConfig().configured ? 'up' : 'not_configured');
}
