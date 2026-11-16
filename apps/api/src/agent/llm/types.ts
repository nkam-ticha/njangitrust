// The language model as the runtime sees it (spec 4.2): chat completions with tool calling. Two
// implementations: OpenRouterClient (production) and ScriptedLlm (tests and the evaluation's
// scripted mode). Both build the provider request body with `toChatBody`, so tests scan exactly
// what would be sent.

export interface LlmToolCall {
  id: string;
  name: string;
  /** The raw JSON text the model produced; parsed and validated by the runtime, never trusted. */
  arguments: string;
}

export type LlmMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; toolCalls?: LlmToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string };

export interface LlmToolSpec {
  name: string;
  description: string;
  /** JSON Schema of the arguments (from the tool's zod schema). */
  parameters: Record<string, unknown>;
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
