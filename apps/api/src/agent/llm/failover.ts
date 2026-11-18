// Several model providers behind one client (spec 4.2, 4.11). The agent asks the first provider;
// when it is rate-limited, overloaded, slow, refuses the key or the request, the next one answers.
//
// Safe by construction:
//  - A model call only produces text and tool calls; the runtime runs the tools. Asking a second
//    provider can therefore never replay anything that moved money or changed the group.
//  - Once text has reached the member (`onDelta` fired) the call is never moved to another
//    provider: the member would see two answers glued together. The error goes up instead.
//  - A provider that failed is put aside for a while (a "cooldown") so that the next messages do
//    not wait on it again. Nothing is shared between serverless instances: a cold instance simply
//    learns again, at the cost of one failed call.
//  - Errors carry a stable code only. Neither a key, a request nor a provider's answer is logged.
import { clock } from '../../lib/clock';
import { componentLogger } from '../../lib/logger';
import { compactRequest, isTakingOver, withHandoverNote } from './compact';
import { LlmError, isLlmError } from './errors';
import type { LlmCallOptions, LlmClient, LlmRequest, LlmResponse } from './types';

const log = componentLogger('agent');

export interface FailoverMember {
  /** `openrouter`, `groq` or `google`: logged and recorded, never a secret. */
  name: string;
  /**
   * Tells apart several keys (accounts) of one provider, e.g. `groq#2`. Each has its own
   * cooldown. Defaults to the name.
   */
  label?: string;
  /** This provider's own model id; it replaces the request's. */
  model: string;
  client: LlmClient;
  /**
   * The most input tokens this provider takes in one request (a free tier's limit). A larger
   * request is cut down to a small important context first (compact.ts). Unset: no limit.
   */
  maxInputTokens?: number;
}

export interface FailoverOptions {
  /** One provider's share of a call. A provider still working after this is given up on. */
  memberTimeoutMs: number;
  now?: () => number;
}

/** How long a provider is left alone after each kind of failure. */
const COOLDOWN_MS: Record<string, number> = {
  LLM_RATE_LIMITED: 60_000,
  LLM_UNAVAILABLE: 30_000,
  LLM_TIMEOUT: 30_000,
  LLM_AUTH: 600_000,
  LLM_BAD_REQUEST: 60_000,
  LLM_BAD_RESPONSE: 30_000,
};

/** The error to report when every provider failed: the most useful one, not just the last. */
const INFORMATIVE = ['LLM_RATE_LIMITED', 'LLM_UNAVAILABLE', 'LLM_TIMEOUT'] as const;

const idOf = (member: FailoverMember): string => member.label ?? member.name;

export class FailoverLlm implements LlmClient {
  readonly name = 'failover';
  private readonly cooldownUntil = new Map<string, number>();
  private readonly now: () => number;

  constructor(
    private readonly members: readonly FailoverMember[],
    private readonly options: FailoverOptions,
  ) {
    if (members.length === 0) throw new Error('FailoverLlm needs at least one provider');
    this.now = options.now ?? (() => clock.nowMs());
  }

  /**
   * Entries to try now, in the order given (the batches of config.ts: the first account of every
   * provider, then the second account of every provider...). Resting entries come last, the one
   * that rests the shortest first. So a later batch is asked only once the earlier ones are all
   * resting or have just failed.
   */
  private candidates(): FailoverMember[] {
    const now = this.now();
    const rests = (m: FailoverMember) => this.cooldownUntil.get(idOf(m)) ?? 0;
    const ready = this.members.filter((m) => rests(m) <= now);
    const resting = this.members.filter((m) => rests(m) > now).sort((a, b) => rests(a) - rests(b));
    return [...ready, ...resting];
  }

  /** What this provider is sent: its own model, its size limit, and a note when it takes over. */
  private requestFor(request: LlmRequest, member: FailoverMember): LlmRequest {
    let next: LlmRequest = { ...request, model: member.model };
    if (member.maxInputTokens) next = compactRequest(next, member.maxInputTokens);
    if (isTakingOver(next.messages, member.name)) {
      next = { ...next, messages: withHandoverNote(next.messages) };
    }
    return next;
  }

  async chat(request: LlmRequest, options: LlmCallOptions = {}): Promise<LlmResponse> {
    const failures: LlmError[] = [];
    for (const member of this.candidates()) {
      if (options.signal?.aborted) throw new LlmError('LLM_ABORTED', false);
      let streamed = false;
      const own = AbortSignal.timeout(this.options.memberTimeoutMs);
      const signal = options.signal ? AbortSignal.any([options.signal, own]) : own;
      const startedAt = this.now();
      try {
        const response = await member.client.chat(this.requestFor(request, member), {
          signal,
          onDelta: (text: string) => {
            streamed = true;
            options.onDelta?.(text);
          },
        });
        this.cooldownUntil.delete(idOf(member));
        if (failures.length > 0) {
          log.warn(
            {
              provider: idOf(member),
              skipped: failures.map((f) => f.code),
              purpose: request.purpose,
            },
            'model provider took over',
          );
        }
        return { ...response, provider: member.name, model: member.model };
      } catch (raised) {
        let error = isLlmError(raised) ? raised : new LlmError('LLM_BAD_RESPONSE', false);
        // The caller gave up (the turn is out of time): no other provider could finish either.
        if (options.signal?.aborted) throw new LlmError(error.code, error.retryable, error.status);
        // Our own per-provider timer fired: that provider is too slow, try the next.
        if (own.aborted) error = new LlmError('LLM_TIMEOUT', true);
        if (streamed) throw error;
        failures.push(error);
        this.cooldownUntil.set(idOf(member), this.now() + (COOLDOWN_MS[error.code] ?? 30_000));
        log.warn(
          {
            provider: idOf(member),
            code: error.code,
            status: error.status ?? null,
            ms: this.now() - startedAt,
            purpose: request.purpose,
          },
          'model provider failed',
        );
      }
    }
    for (const code of INFORMATIVE) {
      const found = failures.find((f) => f.code === code);
      if (found) throw found;
    }
    throw failures[failures.length - 1] ?? new LlmError('LLM_NOT_CONFIGURED', false);
  }
}
