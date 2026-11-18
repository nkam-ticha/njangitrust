import { describe, expect, it } from 'vitest';
import { agentConfigFrom, keysOf, providerOrder } from '../config';
import { LlmError } from './errors';
import { FailoverLlm, type FailoverMember } from './failover';
import { OpenRouterClient } from './openrouter';
import type { LlmCallOptions, LlmClient, LlmRequest, LlmResponse } from './types';

const request: LlmRequest = {
  model: 'ignored',
  purpose: 'turn',
  temperature: 0.2,
  tools: [],
  messages: [{ role: 'user', content: 'Bonjour' }],
};

const ok = (text: string): LlmResponse => ({ text, toolCalls: [], finishReason: 'stop' });

type Step = LlmResponse | LlmError | ((o: LlmCallOptions) => Promise<LlmResponse>);

/** A provider that follows a script and records the model it was asked for. */
function provider(name: string, steps: Step[]): FailoverMember & { models: string[] } {
  const models: string[] = [];
  const client: LlmClient = {
    name,
    async chat(req, options = {}) {
      models.push(req.model);
      const step = steps.shift();
      if (!step) throw new Error('unexpected call');
      if (step instanceof LlmError) throw step;
      if (typeof step === 'function') return step(options);
      return step;
    },
  };
  return { name, model: `${name}/model`, client, models };
}

const make = (members: FailoverMember[], now = () => 0) =>
  new FailoverLlm(members, { memberTimeoutMs: 1_000, now });

describe('FailoverLlm: the next provider takes over', () => {
  it('answers with the first provider and gives it its own model id', async () => {
    const a = provider('openrouter', [ok('one')]);
    const b = provider('groq', [ok('two')]);
    const res = await make([a, b]).chat(request);
    expect(res).toMatchObject({ text: 'one', provider: 'openrouter', model: 'openrouter/model' });
    expect(a.models).toEqual(['openrouter/model']);
    expect(b.models).toEqual([]);
  });

  it.each([
    ['rate limit (429)', new LlmError('LLM_RATE_LIMITED', true, 429)],
    ['overload (503)', new LlmError('LLM_UNAVAILABLE', true, 503)],
    ['wrong key (401)', new LlmError('LLM_AUTH', false, 401)],
    ['refused request (400)', new LlmError('LLM_BAD_REQUEST', false, 400)],
    ['empty answer', new LlmError('LLM_BAD_RESPONSE', false)],
  ])('moves on after %s', async (_label, error) => {
    const a = provider('openrouter', [error]);
    const b = provider('groq', [ok('from groq')]);
    const res = await make([a, b]).chat(request);
    expect(res).toMatchObject({ text: 'from groq', provider: 'groq' });
  });

  it('goes down the whole chain to the third provider', async () => {
    const a = provider('openrouter', [new LlmError('LLM_RATE_LIMITED', true, 429)]);
    const b = provider('groq', [new LlmError('LLM_UNAVAILABLE', true, 503)]);
    const c = provider('google', [ok('from google')]);
    expect((await make([a, b, c]).chat(request)).provider).toBe('google');
  });

  it('gives up on a provider that is too slow and asks the next', async () => {
    const slow = provider('openrouter', [
      (o) =>
        new Promise((_resolve, reject) => {
          o.signal?.addEventListener('abort', () => reject(new LlmError('LLM_ABORTED', false)));
        }),
    ]);
    const b = provider('groq', [ok('quick')]);
    const llm = new FailoverLlm([slow, b], { memberTimeoutMs: 20 });
    expect((await llm.chat(request)).provider).toBe('groq');
  });

  it('reports the most useful error when every provider failed', async () => {
    const a = provider('openrouter', [new LlmError('LLM_RATE_LIMITED', true, 429)]);
    const b = provider('groq', [new LlmError('LLM_AUTH', false, 401)]);
    const error = (await make([a, b])
      .chat(request)
      .catch((e: unknown) => e)) as LlmError;
    expect(error.code).toBe('LLM_RATE_LIMITED');
  });
});

describe('FailoverLlm: what must never happen', () => {
  it('never switches once text has reached the member', async () => {
    const a = provider('openrouter', [
      (o) => {
        o.onDelta?.('Bon');
        return Promise.reject(new LlmError('LLM_UNAVAILABLE', true));
      },
    ]);
    const b = provider('groq', [ok('never used')]);
    const deltas: string[] = [];
    const error = (await make([a, b])
      .chat(request, { onDelta: (d) => deltas.push(d) })
      .catch((e: unknown) => e)) as LlmError;
    expect(error.code).toBe('LLM_UNAVAILABLE');
    expect(deltas).toEqual(['Bon']);
    expect(b.models).toEqual([]);
  });

  it('does not try another provider when the caller already gave up', async () => {
    const controller = new AbortController();
    const a = provider('openrouter', [
      () => {
        controller.abort();
        return Promise.reject(new LlmError('LLM_ABORTED', false));
      },
    ]);
    const b = provider('groq', [ok('never used')]);
    const error = (await make([a, b])
      .chat(request, { signal: controller.signal })
      .catch((e: unknown) => e)) as LlmError;
    expect(error.code).toBe('LLM_ABORTED');
    expect(b.models).toEqual([]);
  });

  it('keeps tool calls as data: the failed provider contributes nothing', async () => {
    const a = provider('openrouter', [new LlmError('LLM_RATE_LIMITED', true, 429)]);
    const calls = [{ id: 'c1', name: 'get_rules', arguments: '{}' }];
    const b = provider('groq', [{ text: '', toolCalls: calls, finishReason: 'tool_calls' }]);
    const res = await make([a, b]).chat(request);
    expect(res.toolCalls).toEqual(calls);
  });

  it('puts a failed provider aside, then asks it again after its cooldown', async () => {
    let clock = 0;
    const a = provider('openrouter', [new LlmError('LLM_RATE_LIMITED', true, 429), ok('back')]);
    const b = provider('groq', [ok('1'), ok('2')]);
    const llm = make([a, b], () => clock);
    expect((await llm.chat(request)).provider).toBe('groq');
    // Within the cooldown the resting provider is not asked first.
    expect((await llm.chat(request)).provider).toBe('groq');
    expect(a.models).toHaveLength(1);
    clock = 61_000;
    expect((await llm.chat(request)).provider).toBe('openrouter');
  });

  it('still tries resting providers when all of them are resting', async () => {
    const a = provider('openrouter', [new LlmError('LLM_RATE_LIMITED', true, 429), ok('a again')]);
    const b = provider('groq', [new LlmError('LLM_RATE_LIMITED', true, 429)]);
    const llm = make([a, b]);
    await expect(llm.chat(request)).rejects.toBeInstanceOf(LlmError);
    expect((await llm.chat(request)).text).toBe('a again');
  });
});

describe('OpenAI-compatible client: Google leaves out the tool-call index', () => {
  it('keeps two parallel calls apart when only ids tell them apart', async () => {
    const chunk = (delta: Record<string, unknown>, finish: string | null = null) => ({
      id: 'x',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'm',
      choices: [{ index: 0, delta, finish_reason: finish }],
    });
    const body =
      [
        chunk({ tool_calls: [{ id: 'a', function: { name: 'get_rules', arguments: '{"g"' } }] }),
        chunk({ tool_calls: [{ function: { arguments: ':1}' } }] }),
        chunk(
          { tool_calls: [{ id: 'b', function: { name: 'get_my_dues', arguments: '{}' } }] },
          'tool_calls',
        ),
      ]
        .map((c) => `data: ${JSON.stringify(c)}\n\n`)
        .join('') + 'data: [DONE]\n\n';
    const client = new OpenRouterClient({
      name: 'google',
      apiKey: 'not-a-real-key',
      baseUrl: 'https://google.invalid/v1beta/openai',
      timeoutMs: 5_000,
      backoffMs: [],
      fetch: () => Promise.resolve(new Response(body, { status: 200 })),
    });
    const res = await client.chat({ ...request, tools: [] });
    expect(res.toolCalls).toEqual([
      { id: 'a', name: 'get_rules', arguments: '{"g":1}' },
      { id: 'b', name: 'get_my_dues', arguments: '{}' },
    ]);
  });
});

describe('agent configuration: providers and their order', () => {
  const base = {
    OPENROUTER_API_KEY: 'k1',
    OPENROUTER_MODEL: 'nvidia/nemotron-3.5-lightning:free',
    OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
    GROQ_API_KEY: 'k2',
    GROQ_MODEL: 'qwen/qwen3.8-27b',
    GROQ_BASE_URL: 'https://api.groq.com/openai/v1',
    GROQ_MAX_INPUT_TOKENS: 3500,
    OPENROUTER_API_KEYS: undefined,
    GROQ_API_KEYS: undefined,
    GOOGLE_AI_API_KEYS: undefined,
    GOOGLE_AI_API_KEY: 'k3',
    GOOGLE_AI_MODEL: 'gemini-3.8-flash',
    GOOGLE_AI_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    LLM_PROVIDER_ORDER: 'openrouter,groq,google',
    AGENT_TOOL_ROUTING: 'off' as const,
  };

  it('lists the three providers in the default order', () => {
    const config = agentConfigFrom(base);
    expect(config.providers.map((p) => p.name)).toEqual(['openrouter', 'groq', 'google']);
    expect(config.configured).toBe(true);
    expect(config.model).toBe('nvidia/nemotron-3.5-lightning:free');
  });

  it('leaves out a provider that lacks its key or its model', () => {
    const config = agentConfigFrom({
      ...base,
      GROQ_API_KEY: undefined,
      GOOGLE_AI_MODEL: undefined,
    });
    expect(config.providers.map((p) => p.name)).toEqual(['openrouter']);
    expect(config.memberTimeoutMs).toBe(20_000);
  });

  it('is not configured with no provider at all', () => {
    const config = agentConfigFrom({
      ...base,
      OPENROUTER_API_KEY: undefined,
      GROQ_API_KEY: undefined,
      GOOGLE_AI_API_KEY: undefined,
    });
    expect(config.configured).toBe(false);
    expect(config.model).toBeNull();
  });

  it('a call shared by three providers fits inside the turn budget', () => {
    const config = agentConfigFrom(base);
    expect(config.requestTimeoutMs).toBeLessThanOrEqual(config.turnBudgetMs);
  });

  it('follows LLM_PROVIDER_ORDER, ignores unknown names and keeps the rest last', () => {
    expect(providerOrder('google, nonsense ,groq')).toEqual(['google', 'groq', 'openrouter']);
    expect(providerOrder('')).toEqual(['openrouter', 'groq', 'google']);
    expect(providerOrder('groq,groq')).toEqual(['groq', 'openrouter', 'google']);
  });
});

describe('several accounts: a second batch only when the first has stopped', () => {
  it('reads the single key and the list, each once, in order', () => {
    expect(keysOf('a', 'b, c ;a d')).toEqual(['a', 'b', 'c', 'd']);
    expect(keysOf(undefined, undefined)).toEqual([]);
    expect(keysOf(undefined, ' x ')).toEqual(['x']);
  });

  const six = {
    OPENROUTER_API_KEY: 'o1',
    OPENROUTER_API_KEYS: 'o2',
    OPENROUTER_MODEL: 'nvidia/nemotron-3.5-lightning:free',
    OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
    GROQ_API_KEY: 'g1',
    GROQ_API_KEYS: 'g2',
    GROQ_MODEL: 'qwen/qwen3.8-27b',
    GROQ_BASE_URL: 'https://api.groq.com/openai/v1',
    GROQ_MAX_INPUT_TOKENS: 3500,
    GOOGLE_AI_API_KEY: 'x1',
    GOOGLE_AI_API_KEYS: 'x2',
    GOOGLE_AI_MODEL: 'gemini-3.5-flash-lite',
    GOOGLE_AI_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    LLM_PROVIDER_ORDER: 'openrouter,groq,google',
    AGENT_TOOL_ROUTING: 'off' as const,
  };

  it('puts six models in two batches: the first account of each provider, then the second', () => {
    const providers = agentConfigFrom(six).providers;
    expect(providers.map((p) => `${p.name}#${p.account}:${p.apiKey}`)).toEqual([
      'openrouter#1:o1',
      'groq#1:g1',
      'google#1:x1',
      'openrouter#2:o2',
      'groq#2:g2',
      'google#2:x2',
    ]);
    // Same model for both accounts of a provider; Groq's size limit applies to both.
    expect(providers.filter((p) => p.name === 'groq').map((p) => p.maxInputTokens)).toEqual([
      3500, 3500,
    ]);
    expect(agentConfigFrom(six).requestTimeoutMs).toBeLessThanOrEqual(40_000);
  });

  it('keeps Google last in each batch when it is listed last, and follows LLM_PROVIDER_ORDER', () => {
    const order = agentConfigFrom({ ...six, LLM_PROVIDER_ORDER: 'groq,openrouter,google' });
    expect(order.providers.map((p) => `${p.name}#${p.account}`)).toEqual([
      'groq#1',
      'openrouter#1',
      'google#1',
      'groq#2',
      'openrouter#2',
      'google#2',
    ]);
  });

  it('handles uneven batches: a provider with one key is only in the first', () => {
    const uneven = agentConfigFrom({ ...six, GROQ_API_KEYS: undefined });
    expect(uneven.providers.map((p) => `${p.name}#${p.account}`)).toEqual([
      'openrouter#1',
      'groq#1',
      'google#1',
      'openrouter#2',
      'google#2',
    ]);
  });

  const key = (name: string, label: string, steps: Step[]) => ({
    ...provider(name, steps),
    label,
  });

  it('asks the next provider of the same batch before the second account of the first', async () => {
    const or1 = key('openrouter', 'openrouter#1', [new LlmError('LLM_RATE_LIMITED', true, 429)]);
    const groq1 = key('groq', 'groq#1', [ok('batch one, groq')]);
    const or2 = key('openrouter', 'openrouter#2', [ok('never used')]);
    const res = await make([or1, groq1, or2]).chat(request);
    expect(res.text).toBe('batch one, groq');
    expect(or2.models).toEqual([]);
  });

  it('uses the second batch only when every entry of the first has failed', async () => {
    const batch1 = [
      key('openrouter', 'openrouter#1', [new LlmError('LLM_RATE_LIMITED', true, 429)]),
      key('groq', 'groq#1', [new LlmError('LLM_RATE_LIMITED', true, 429)]),
      key('google', 'google#1', [new LlmError('LLM_UNAVAILABLE', true, 503)]),
    ];
    const second = key('openrouter', 'openrouter#2', [ok('second batch')]);
    const res = await make([...batch1, second]).chat(request);
    expect(res).toMatchObject({ text: 'second batch', provider: 'openrouter' });
    for (const member of batch1) expect(member.models).toHaveLength(1);
  });

  it('leaves the second batch alone while the first one answers', async () => {
    const first = key('groq', 'groq#1', [ok('1'), ok('2'), ok('3')]);
    const second = key('groq', 'groq#2', [ok('never')]);
    const llm = make([first, second]);
    for (let n = 0; n < 3; n += 1) await llm.chat(request);
    expect(second.models).toEqual([]);
  });

  it('goes back to the first batch as soon as its cooldown is over', async () => {
    let clock = 0;
    const first = key('groq', 'groq#1', [
      new LlmError('LLM_RATE_LIMITED', true, 429),
      ok('first again'),
    ]);
    const second = key('groq', 'groq#2', [ok('second'), ok('second again')]);
    const llm = make([first, second], () => clock);
    expect((await llm.chat(request)).text).toBe('second');
    expect((await llm.chat(request)).text).toBe('second again');
    expect(first.models).toHaveLength(1);
    clock = 61_000;
    expect((await llm.chat(request)).text).toBe('first again');
  });

  it('hands the work of one account to another account of the same provider with the note', async () => {
    const seen: LlmRequest[] = [];
    const a = key('openrouter', 'openrouter#1', [ok('x')]);
    a.client.chat = () => Promise.reject(new LlmError('LLM_RATE_LIMITED', true, 429));
    const b = key('openrouter', 'openrouter#2', []);
    b.client.chat = (req) => {
      seen.push(req);
      return Promise.resolve(ok('done'));
    };
    const res = await make([a, b]).chat(request);
    expect(res.text).toBe('done');
    expect(seen[0]!.model).toBe('openrouter/model');
  });
});
