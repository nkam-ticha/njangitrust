// OpenRouter through its OpenAI-compatible API (spec 2.2, 4.2, 4.11), with the `openai` package.
// Streaming; one request timeout; retries only on 429, 5xx and connection failures, with backoff,
// and only while nothing has been streamed yet. The runtime executes tools itself, so a retry here
// can never replay a tool. Errors map to stable codes; nothing of the request or of the provider's
// answer is ever put in an error or a log line.
import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
} from 'openai';
import { toChatBody } from './body';
import { LlmError, llmErrorForStatus } from './errors';
import type { LlmCallOptions, LlmClient, LlmRequest, LlmResponse, LlmToolCall } from './types';

export interface OpenRouterOptions {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  /** Tests inject a fake fetch; nothing then reaches the network. */
  fetch?: typeof fetch;
  /** Waits between attempts, in milliseconds. Its length is the number of retries. */
  backoffMs?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_BACKOFF = [500, 1_500] as const;

/** Maps anything the SDK throws to a stable LlmError. */
export function toLlmError(error: unknown): LlmError {
  if (error instanceof LlmError) return error;
  if (error instanceof APIUserAbortError) return new LlmError('LLM_ABORTED', false);
  if (error instanceof APIConnectionTimeoutError) return new LlmError('LLM_TIMEOUT', true);
  if (error instanceof APIConnectionError) return new LlmError('LLM_UNAVAILABLE', true);
  if (error instanceof APIError) {
    // No status: the provider reported an error inside the stream.
    return typeof error.status === 'number'
      ? llmErrorForStatus(error.status)
      : new LlmError('LLM_UNAVAILABLE', true);
  }
  return new LlmError('LLM_BAD_RESPONSE', false);
}

interface PartialCall {
  id: string;
  name: string;
  arguments: string;
}

export class OpenRouterClient implements LlmClient {
  readonly name = 'openrouter';
  private readonly client: OpenAI;
  private readonly backoff: readonly number[];
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: OpenRouterOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
      timeout: options.timeoutMs,
      // Retries are ours (below): never after output has been streamed.
      maxRetries: 0,
      ...(options.fetch ? { fetch: options.fetch } : {}),
      defaultHeaders: { 'X-Title': 'NjangiTrust' },
    });
    this.backoff = options.backoffMs ?? DEFAULT_BACKOFF;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async chat(request: LlmRequest, options: LlmCallOptions = {}): Promise<LlmResponse> {
    for (let attempt = 0; ; attempt += 1) {
      let streamed = false;
      try {
        return await this.once(request, options, () => {
          streamed = true;
        });
      } catch (error) {
        const mapped = toLlmError(error);
        const wait = this.backoff[attempt];
        if (!mapped.retryable || streamed || wait === undefined) throw mapped;
        await this.sleep(wait);
      }
    }
  }

  private async once(
    request: LlmRequest,
    options: LlmCallOptions,
    markStreamed: () => void,
  ): Promise<LlmResponse> {
    const body = toChatBody(request) as unknown as OpenAI.ChatCompletionCreateParamsStreaming;
    const stream = await this.client.chat.completions.create(body, {
      ...(options.signal ? { signal: options.signal } : {}),
    });
    let text = '';
    let finishReason: string | null = null;
    const calls = new Map<number, PartialCall>();
    for await (const chunk of stream) {
      // OpenRouter reports a failure after the stream started as a chunk carrying `error`.
      if ((chunk as { error?: unknown }).error) throw new LlmError('LLM_UNAVAILABLE', true);
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      const content = choice.delta?.content;
      if (content) {
        text += content;
        markStreamed();
        options.onDelta?.(content);
      }
      for (const part of choice.delta?.tool_calls ?? []) {
        const current = calls.get(part.index) ?? { id: '', name: '', arguments: '' };
        if (part.id) current.id = part.id;
        if (part.function?.name) current.name += part.function.name;
        if (part.function?.arguments) current.arguments += part.function.arguments;
        calls.set(part.index, current);
      }
      if (choice.finish_reason) finishReason = choice.finish_reason;
    }
    const toolCalls: LlmToolCall[] = [...calls.entries()]
      .sort(([a], [b]) => a - b)
      .map(([index, call]) => ({
        id: call.id || `call_${index}`,
        name: call.name,
        arguments: call.arguments || '{}',
      }));
    if (!text && toolCalls.length === 0) throw new LlmError('LLM_BAD_RESPONSE', false);
    return { text, toolCalls, finishReason };
  }
}
