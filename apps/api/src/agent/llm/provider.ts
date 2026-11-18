// The process's model client: the configured providers in order (OpenRouter, Groq, Google AI
// Studio), nothing when none is configured. Tests (and the evaluation's scripted mode) install a
// ScriptedLlm instead; nothing then reaches the network.
import { agentConfig, standInAllowed, type AgentConfig, type ProviderConfig } from '../config';
import { FailoverLlm, type FailoverMember } from './failover';
import { OpenRouterClient } from './openrouter';
import type { LlmClient } from './types';

let client: LlmClient | null = null;
let clientKey: string | null = null;
let override: LlmClient | null = null;

/** Per-provider differences. Nothing here carries member data. */
function clientFor(provider: ProviderConfig, config: AgentConfig): OpenRouterClient {
  return new OpenRouterClient({
    name: provider.name,
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
    timeoutMs: config.memberTimeoutMs,
    ...(provider.name === 'openrouter' ? { headers: { 'X-Title': 'NjangiTrust' } } : {}),
    ...(provider.name === 'google' ? { flavor: { googleSignatures: true } } : {}),
    // With another provider waiting, a failure is handed over at once instead of retried here.
    ...(config.providers.length > 1 ? { backoffMs: [] } : {}),
  });
}

/** One entry of the chain per configured key, in the order of config.providers (the batches). */
export function buildMembers(config: AgentConfig): FailoverMember[] {
  return config.providers.map((provider) => ({
    name: provider.name,
    label: `${provider.name}#${provider.account}`,
    model: provider.model,
    client: clientFor(provider, config),
    ...(provider.maxInputTokens ? { maxInputTokens: provider.maxInputTokens } : {}),
  }));
}

/** The chain of providers of this configuration, or null when none is configured. */
export function buildLlm(config: AgentConfig): LlmClient | null {
  if (config.providers.length === 0) return null;
  return new FailoverLlm(buildMembers(config), { memberTimeoutMs: config.memberTimeoutMs });
}

/** The model client, or null when no provider has both its key and its model. */
export function getLlm(): LlmClient | null {
  if (override) return override;
  // Tests never reach the network, even if apps/api/.env holds real keys.
  if (process.env.NODE_ENV === 'test') return null;
  const config = agentConfig();
  if (!config.configured) return null;
  const key = config.providers
    .map((p) => `${p.name}|${p.account}|${p.baseUrl}|${p.model}|${p.apiKey}`)
    .join('\n');
  if (!client || clientKey !== key) {
    client = buildLlm(config);
    clientKey = key;
  }
  return client;
}

/** Tests and the evaluation only (the evaluation wraps the client to record what is sent). */
export function setLlmForTests(next: LlmClient | null): void {
  if (!standInAllowed()) throw new Error('test only');
  override = next;
}
