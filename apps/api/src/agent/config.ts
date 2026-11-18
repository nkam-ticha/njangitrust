// The agent's configuration (spec 2.16, 4.11), read from the validated environment. API keys never
// leave this module except to the client of their own provider; they are never logged or returned.
import { getEnv, type Env } from '../config/env';

export type ProviderName = 'openrouter' | 'groq' | 'google';

/** One model provider the agent can ask. The list is ordered: the first is asked first. */
export interface ProviderConfig {
  name: ProviderName;
  /** 1 for the provider's first key, 2 for its second: several keys give several entries. */
  account: number;
  apiKey: string;
  model: string;
  baseUrl: string;
  /** Requests larger than this (estimated tokens) are cut to a small important context. */
  maxInputTokens?: number;
}

export interface AgentConfig {
  /** True when at least one provider has both its key and its model. */
  configured: boolean;
  /** Providers in the order they are asked. A provider missing its key or model is left out. */
  providers: ProviderConfig[];
  /** The first provider's key, model and base URL (null / default when none is configured). */
  apiKey: string | null;
  model: string | null;
  baseUrl: string;
  /** Spec 4.11: a short classification call picks the tool categories first. Off by default. */
  toolRouting: boolean;
  /** One provider's share of a model call. */
  memberTimeoutMs: number;
  /**
   * The whole model call, every provider that may be tried included. Below the turn budget,
   * itself below the 60 s limit of a serverless request.
   */
  requestTimeoutMs: number;
  /** The whole turn: every model call and tool of the loop (spec 4.2). */
  turnBudgetMs: number;
  temperature: number;
}

/** What the agent reads from the environment. */
type AgentEnv = Pick<
  Env,
  | 'OPENROUTER_API_KEY'
  | 'OPENROUTER_API_KEYS'
  | 'GROQ_API_KEYS'
  | 'GOOGLE_AI_API_KEYS'
  | 'OPENROUTER_MODEL'
  | 'OPENROUTER_BASE_URL'
  | 'GROQ_API_KEY'
  | 'GROQ_MODEL'
  | 'GROQ_BASE_URL'
  | 'GROQ_MAX_INPUT_TOKENS'
  | 'OPENROUTER_MAX_INPUT_TOKENS'
  | 'GOOGLE_AI_MAX_INPUT_TOKENS'
  | 'GOOGLE_AI_API_KEY'
  | 'GOOGLE_AI_MODEL'
  | 'GOOGLE_AI_BASE_URL'
  | 'LLM_PROVIDER_ORDER'
  | 'AGENT_TOOL_ROUTING'
>;

const DEFAULT_ORDER: readonly ProviderName[] = ['openrouter', 'groq', 'google'];
const TURN_BUDGET_MS = 40_000;
/** With several providers a slow one must not use the whole call: the next gets its turn. */
const MEMBER_TIMEOUT_MS = 12_000;
const SOLE_PROVIDER_TIMEOUT_MS = 20_000;

/** The names in `LLM_PROVIDER_ORDER`, known ones only, each once. Unlisted providers come last. */
export function providerOrder(raw: string | undefined): ProviderName[] {
  const listed = (raw ?? '')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part): part is ProviderName => (DEFAULT_ORDER as readonly string[]).includes(part));
  return [...new Set([...listed, ...DEFAULT_ORDER])];
}

/** The keys of one provider: its single key first, then the list, each once. */
export function keysOf(single: string | undefined, list: string | undefined): string[] {
  const more = (list ?? '').split(/[\s,;]+/);
  return [...new Set([single ?? '', ...more].map((key) => key.trim()).filter(Boolean))];
}

export function agentConfigFrom(env: AgentEnv): AgentConfig {
  const candidates: Record<
    ProviderName,
    Omit<ProviderConfig, 'name' | 'account' | 'apiKey' | 'model'> & {
      keys: string[];
      model: string | undefined;
    }
  > = {
    openrouter: {
      keys: keysOf(env.OPENROUTER_API_KEY, env.OPENROUTER_API_KEYS),
      model: env.OPENROUTER_MODEL,
      baseUrl: env.OPENROUTER_BASE_URL,
      ...(env.OPENROUTER_MAX_INPUT_TOKENS
        ? { maxInputTokens: env.OPENROUTER_MAX_INPUT_TOKENS }
        : {}),
    },
    groq: {
      keys: keysOf(env.GROQ_API_KEY, env.GROQ_API_KEYS),
      model: env.GROQ_MODEL,
      baseUrl: env.GROQ_BASE_URL,
      maxInputTokens: env.GROQ_MAX_INPUT_TOKENS,
    },
    google: {
      keys: keysOf(env.GOOGLE_AI_API_KEY, env.GOOGLE_AI_API_KEYS),
      model: env.GOOGLE_AI_MODEL,
      baseUrl: env.GOOGLE_AI_BASE_URL,
      ...(env.GOOGLE_AI_MAX_INPUT_TOKENS ? { maxInputTokens: env.GOOGLE_AI_MAX_INPUT_TOKENS } : {}),
    },
  };
  const providers: ProviderConfig[] = [];
  // Batches: the first key of every provider forms the first batch, the second key of every
  // provider the second, and so on. A later batch is only asked when the earlier ones have all
  // stopped (rate limit, outage), so the accounts of a provider are never used side by side.
  const order = providerOrder(env.LLM_PROVIDER_ORDER);
  const batches = Math.max(0, ...order.map((name) => candidates[name].keys.length));
  for (let account = 1; account <= batches; account += 1) {
    for (const name of order) {
      const { keys, model, baseUrl, maxInputTokens } = candidates[name];
      const apiKey = keys[account - 1];
      if (!model || !apiKey) continue;
      providers.push({
        name,
        account,
        apiKey,
        model,
        baseUrl,
        ...(maxInputTokens ? { maxInputTokens } : {}),
      });
    }
  }
  const memberTimeoutMs = providers.length > 1 ? MEMBER_TIMEOUT_MS : SOLE_PROVIDER_TIMEOUT_MS;
  const first = providers[0];
  return {
    configured: providers.length > 0,
    providers,
    apiKey: first?.apiKey ?? null,
    model: first?.model ?? null,
    baseUrl: first?.baseUrl ?? env.OPENROUTER_BASE_URL,
    toolRouting: env.AGENT_TOOL_ROUTING === 'on',
    memberTimeoutMs,
    requestTimeoutMs: Math.min(TURN_BUDGET_MS, memberTimeoutMs * Math.max(1, providers.length)),
    turnBudgetMs: TURN_BUDGET_MS,
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
