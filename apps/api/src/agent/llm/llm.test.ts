import { describe, expect, it } from 'vitest';
import { LlmError } from './errors';
import { OpenRouterClient } from './openrouter';
import { ScriptedLlm } from './scripted';
import type { LlmRequest } from './types';

const request: LlmRequest = {
  model: 'test/model',
  purpose: 'turn',
  temperature: 0.2,
  tools: [{ name: 'get_rules', description: 'Rules', parameters: { type: 'object' } }],
  messages: [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'Bonjour' },
  ],
};

function sse(chunks: unknown[]): Response {
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const chunk = (delta: Record<string, unknown>, finish: string | null = null) => ({
  id: 'x',
  object: 'chat.completion.chunk',
  created: 1,
  model: 'test/model',
  choices: [{ index: 0, delta, finish_reason: finish }],
});

/** A fake fetch: nothing ever reaches the network. Records each request body. */
function fakeFetch(responses: (() => Response)[]) {
  const bodies: Record<string, unknown>[] = [];
  const fn = (_url: unknown, init?: { body?: unknown }) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    const next = responses.shift();
    if (!next) throw new Error('unexpected call');
    return Promise.resolve(next());
  };
  return { fn: fn as unknown as typeof fetch, bodies };
}

const client = (fetchFn: typeof fetch) =>
  new OpenRouterClient({
    apiKey: 'test-key-not-real',
    baseUrl: 'https://openrouter.invalid/api/v1',
    timeoutMs: 5_000,
    fetch: fetchFn,
    backoffMs: [1, 1],
    sleep: () => Promise.resolve(),
  });

describe('OpenRouterClient (spec 4.2, 4.11)', () => {
  it('streams text and sends temperature 0.2, the model and the tools', async () => {
    const fake = fakeFetch([
      () => sse([chunk({ content: 'Bon' }), chunk({ content: 'jour' }, 'stop')]),
    ]);
    const deltas: string[] = [];
    const res = await client(fake.fn).chat(request, { onDelta: (d) => deltas.push(d) });
    expect(res.text).toBe('Bonjour');
    expect(deltas).toEqual(['Bon', 'jour']);
    expect(fake.bodies[0]).toMatchObject({ model: 'test/model', temperature: 0.2, stream: true });
    expect((fake.bodies[0]!.tools as unknown[]).length).toBe(1);
  });

  it('assembles streamed tool calls', async () => {
    const fake = fakeFetch([
      () =>
        sse([
          chunk({
            tool_calls: [
              {
                index: 0,
                id: 'c1',
                type: 'function',
                function: { name: 'get_', arguments: '{"a"' },
              },
            ],
          }),
          chunk(
            { tool_calls: [{ index: 0, function: { name: 'rules', arguments: ':1}' } }] },
            'tool_calls',
          ),
        ]),
    ]);
    const res = await client(fake.fn).chat(request);
    expect(res.toolCalls).toEqual([{ id: 'c1', name: 'get_rules', arguments: '{"a":1}' }]);
  });

  it('retries 429 and 5xx with backoff, then answers', async () => {
    const fake = fakeFetch([
      () => new Response('{}', { status: 429 }),
      () => new Response('{}', { status: 503 }),
      () => sse([chunk({ content: 'ok' }, 'stop')]),
    ]);
    expect((await client(fake.fn).chat(request)).text).toBe('ok');
    expect(fake.bodies).toHaveLength(3);
  });

  it('never retries a 400 or a 401, and maps them to stable codes', async () => {
    for (const [status, code] of [
      [400, 'LLM_BAD_REQUEST'],
      [401, 'LLM_AUTH'],
    ] as const) {
      const fake = fakeFetch([() => new Response('{"error":"secret echo"}', { status })]);
      const error = await client(fake.fn)
        .chat(request)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(LlmError);
      expect((error as LlmError).code).toBe(code);
      expect((error as LlmError).message).not.toContain('secret');
      expect(fake.bodies).toHaveLength(1);
    }
  });

  it('gives up after the last backoff', async () => {
    const fake = fakeFetch([0, 1, 2].map(() => () => new Response('{}', { status: 500 })));
    const error = (await client(fake.fn)
      .chat(request)
      .catch((e: unknown) => e)) as LlmError;
    expect(error.code).toBe('LLM_UNAVAILABLE');
    expect(fake.bodies).toHaveLength(3);
  });

  it('does not retry once text has been streamed', async () => {
    const fake = fakeFetch([
      () => sse([chunk({ content: 'part' }), { error: { message: 'upstream' } }]),
      () => sse([chunk({ content: 'again' }, 'stop')]),
    ]);
    const error = (await client(fake.fn)
      .chat(request)
      .catch((e: unknown) => e)) as LlmError;
    expect(error.code).toBe('LLM_UNAVAILABLE');
    expect(fake.bodies).toHaveLength(1);
  });
});

describe('ScriptedLlm', () => {
  it('answers its script in order and records the exact request bodies', async () => {
    const llm = new ScriptedLlm([{ toolCalls: [{ name: 'get_rules' }] }, { text: 'Voilà.' }]);
    expect((await llm.chat(request)).toolCalls[0]?.name).toBe('get_rules');
    expect((await llm.chat(request)).text).toBe('Voilà.');
    expect(llm.bodies[0]).toMatchObject({ model: 'test/model', temperature: 0.2 });
    await expect(llm.chat(request)).rejects.toBeInstanceOf(LlmError);
  });
});
