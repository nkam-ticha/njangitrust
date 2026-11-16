// The process's model client: OpenRouter when configured, nothing otherwise. Tests (and the
// evaluation's scripted mode) install a ScriptedLlm instead; nothing then reaches the network.
import { agentConfig, standInAllowed } from '../config';
import { OpenRouterClient } from './openrouter';
import type { LlmClient } from './types';

let client: LlmClient | null = null;
let clientKey: string | null = null;
let override: LlmClient | null = null;

/** The model client, or null when OPENROUTER_API_KEY or OPENROUTER_MODEL is missing. */
export function getLlm(): LlmClient | null {
  if (override) return override;
  // Tests never reach the network, even if apps/api/.env holds a real key.
  if (process.env.NODE_ENV === 'test') return null;
  const config = agentConfig();
  if (!config.configured || !config.apiKey) return null;
  const key = `${config.baseUrl}|${config.apiKey}`;
  if (!client || clientKey !== key) {
    client = new OpenRouterClient({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      timeoutMs: config.requestTimeoutMs,
    });
    clientKey = key;
  }
  return client;
}

/** Tests and the evaluation only (the evaluation wraps the client to record what is sent). */
export function setLlmForTests(next: LlmClient | null): void {
  if (!standInAllowed()) throw new Error('test only');
  override = next;
}
