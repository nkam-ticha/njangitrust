// A deterministic stand-in for the model, for tests and the evaluation's scripted mode. Each call
// answers with the next scripted step (or with what a step function returns), and records the
// exact request body the real client would have sent, so tests can scan it.
import { toChatBody, type ChatBody } from './body';
import { LlmError } from './errors';
import type { LlmCallOptions, LlmClient, LlmRequest, LlmResponse } from './types';

/** One scripted answer: some text, or tool calls (arguments as objects, serialised here). */
export interface ScriptedStep {
  text?: string;
  toolCalls?: { name: string; args?: Record<string, unknown>; rawArguments?: string }[];
  /** Throw this error instead of answering. */
  fail?: LlmError;
}

export type ScriptFn = (request: LlmRequest, call: number) => ScriptedStep;

export class ScriptedLlm implements LlmClient {
  readonly name = 'scripted';
  /** Every request body, in order, exactly as the provider would receive it. */
  readonly bodies: ChatBody[] = [];
  readonly requests: LlmRequest[] = [];
  private calls = 0;
  private readonly steps: ScriptedStep[] | null;
  private readonly fn: ScriptFn | null;

  constructor(script: ScriptedStep[] | ScriptFn) {
    this.steps = Array.isArray(script) ? [...script] : null;
    this.fn = Array.isArray(script) ? null : script;
  }

  /** The serialised bodies, for scanning as text. */
  bodyTexts(): string[] {
    return this.bodies.map((body) => JSON.stringify(body));
  }

  chat(request: LlmRequest, options: LlmCallOptions = {}): Promise<LlmResponse> {
    this.requests.push(request);
    this.bodies.push(toChatBody(request));
    const index = this.calls;
    this.calls += 1;
    const step = this.fn ? this.fn(request, index) : this.steps?.[index];
    if (!step) return Promise.reject(new LlmError('LLM_BAD_RESPONSE', false));
    if (step.fail) return Promise.reject(step.fail);
    const text = step.text ?? '';
    // Streams in two pieces so callers exercise partial text.
    if (text && options.onDelta) {
      const middle = Math.ceil(text.length / 2);
      options.onDelta(text.slice(0, middle));
      if (middle < text.length) options.onDelta(text.slice(middle));
    }
    const toolCalls = (step.toolCalls ?? []).map((call, i) => ({
      id: `call_${index}_${i}`,
      name: call.name,
      arguments: call.rawArguments ?? JSON.stringify(call.args ?? {}),
    }));
    return Promise.resolve({
      text,
      toolCalls,
      finishReason: toolCalls.length ? 'tool_calls' : 'stop',
    });
  }
}
