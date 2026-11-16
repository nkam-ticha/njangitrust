// The agent's configuration (spec 2.16, 4.11), read from the validated environment. The API key
// never leaves this module except to the OpenRouter client; it is never logged or returned.
import { getEnv, type Env } from '../config/env';

export interface AgentConfig {
  /** True when both OPENROUTER_API_KEY and OPENROUTER_MODEL are set. */
  configured: boolean;
  apiKey: string | null;
  model: string | null;
  baseUrl: string;
  /** Spec 4.11: a short classification call picks the tool categories first. Off by default. */
  toolRouting: boolean;
  /** Per model call. Below the turn budget, itself below the 60 s limit of a serverless request. */
  requestTimeoutMs: number;
  /** The whole turn: every model call and tool of the loop (spec 4.2). */
  turnBudgetMs: number;
  temperature: number;
}

/** What the agent reads from the environment. */
type AgentEnv = Pick<
  Env,
  'OPENROUTER_API_KEY' | 'OPENROUTER_MODEL' | 'OPENROUTER_BASE_URL' | 'AGENT_TOOL_ROUTING'
>;

export function agentConfigFrom(env: AgentEnv): AgentConfig {
  const apiKey = env.OPENROUTER_API_KEY ?? null;
  const model = env.OPENROUTER_MODEL ?? null;
  return {
    configured: apiKey !== null && model !== null,
    apiKey,
    model,
    baseUrl: env.OPENROUTER_BASE_URL,
    toolRouting: env.AGENT_TOOL_ROUTING === 'on',
    requestTimeoutMs: 20_000,
    turnBudgetMs: 40_000,
    temperature: 0.2,
  };
}

let override: AgentConfig | null = null;

export function agentConfig(): AgentConfig {
  return override ?? agentConfigFrom(getEnv());
}

/**
 * Whether a stand-in may replace the configuration and the model: in tests, and in the evaluation
 * harness (tools/agent-eval sets NJANGI_AGENT_EVAL for its own process). Never in production.
 */
export function standInAllowed(): boolean {
  if (process.env.NODE_ENV === 'test') return true;
  if (process.env.NODE_ENV === 'production') return false;
  return ['scripted', 'live'].includes(process.env.NJANGI_AGENT_EVAL ?? '');
}

/** Tests and the evaluation only: pretend a configuration (a scripted model stands in). */
export function setAgentConfigForTests(config: Partial<AgentConfig> | null): void {
  if (!standInAllowed()) throw new Error('test only');
  override = config ? { ...agentConfigFrom(getEnv()), ...config } : null;
}
