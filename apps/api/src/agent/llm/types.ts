// The language model as the runtime sees it (spec 4.2): chat completions with tool calling. Three
// implementations: OpenRouterClient (production; it also serves Groq and Google), FailoverLlm (the
// providers in order) and ScriptedLlm (tests and the evaluation's scripted mode). The real clients
// build the provider request body with `toChatBody`, as does ScriptedLlm, so tests scan exactly
// what would be sent.

export interface LlmToolCall {
  id: string;
  name: string;
  /** The raw JSON text the model produced; parsed and validated by the runtime, never trusted. */
  arguments: string;
  /** Google's opaque "thought signature" for this call, handed back when the call is replayed. */
  signature?: string;
}

export type LlmMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content: string | null;
      toolCalls?: LlmToolCall[];
      /** The provider that produced it (names only): lets the next one know it is taking over. */
      by?: string;
    }
  | { role: 'tool'; toolCallId: string; content: string };

export interface LlmToolSpec {
  name: string;
  description: string;
  /** JSON Schema of the arguments (from the tool's zod schema). */
  parameters: Record<string, unknown>;
  /** The tool's category (spec 4.11): lets a small provider be sent only the relevant tools. */
  category?: string;
}

export type LlmPurpose = 'turn' | 'summary' | 'routing';

export interface LlmRequest {
  model: string;
  messages: LlmMessage[];
  tools: LlmToolSpec[];
  temperature: number;
  maxTokens?: number;
  /** Which call this is (logged by name only). */
  purpose: LlmPurpose;
}

export interface LlmResponse {
  text: string;
  toolCalls: LlmToolCall[];
  finishReason: string | null;
  /** Which provider and model answered, when several may (names only, for the audit). */
  provider?: string;
  model?: string;
}

export interface LlmCallOptions {
  /** Streamed text, in order, as it arrives. */
  onDelta?: (text: string) => void;
  signal?: AbortSignal;
}

export interface LlmClient {
  readonly name: string;
  chat(request: LlmRequest, options?: LlmCallOptions): Promise<LlmResponse>;
}
