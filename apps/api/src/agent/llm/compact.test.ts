import { describe, expect, it } from 'vitest';
import { GOOGLE_SKIP_SIGNATURE, toChatBody } from './body';
import {
  HANDOVER_NOTE,
  compactRequest,
  estimateTokens,
  isTakingOver,
  topicsOf,
  withHandoverNote,
} from './compact';
import { FailoverLlm, type FailoverMember } from './failover';
import type { LlmMessage, LlmRequest, LlmResponse, LlmToolSpec } from './types';

const tool = (name: string, category: string, size = 400): LlmToolSpec => ({
  name,
  category,
  description: 'x'.repeat(size),
  parameters: { type: 'object', properties: {} },
});

const tools = [
  tool('get_rules', 'reading'),
  tool('get_my_dues', 'reading'),
  tool('pay_contribution', 'payments'),
  tool('request_loan', 'loans'),
  tool('propose_change', 'governance', 4_000),
  tool('send_chat_message', 'chat'),
  tool('schedule_meeting', 'meetings'),
  tool('change_payment_number', 'account'),
];

const system: LlmMessage = { role: 'system', content: 'RULES. '.repeat(100) };

function request(over: Partial<LlmRequest> = {}): LlmRequest {
  return {
    model: 'm',
    purpose: 'turn',
    temperature: 0.2,
    tools,
    messages: [
      system,
      { role: 'user', content: 'ancien message '.repeat(60) },
      { role: 'assistant', content: 'ancienne réponse '.repeat(60) },
      { role: 'user', content: 'Je veux payer ma cotisation' },
    ],
    ...over,
  };
}

describe('topicsOf: what a message is about (French and English)', () => {
  it('always keeps reading, and adds what the words point to', () => {
    expect([...topicsOf('Bonjour')]).toEqual(['reading']);
    expect(topicsOf('Je veux payer ma cotisation').has('payments')).toBe(true);
    expect(topicsOf('Can I borrow 50 000 from the fund?').has('loans')).toBe(true);
    expect(topicsOf('Propose un vote pour changer la règle').has('governance')).toBe(true);
    expect(topicsOf('Planifie une réunion samedi').has('meetings')).toBe(true);
    expect(topicsOf('Change my phone number').has('account')).toBe(true);
    expect(topicsOf('Summarize me notes from my group').has('chat')).toBe(true);
    expect(topicsOf('Résume les messages non lus').has('chat')).toBe(true);
  });
});

describe('compactRequest: a small important context', () => {
  it('leaves a request that already fits untouched', () => {
    const small = request({
      tools: [tools[0]!],
      messages: [system, { role: 'user', content: 'hi' }],
    });
    expect(compactRequest(small, 100_000)).toBe(small);
  });

  it('keeps the system prompt, the current question and only the relevant tools', () => {
    const full = request();
    const compact = compactRequest(full, 1_500);
    expect(estimateTokens(compact)).toBeLessThan(estimateTokens(full));
    expect(compact.messages[0]).toEqual(system);
    expect(compact.messages.at(-1)).toEqual({
      role: 'user',
      content: 'Je veux payer ma cotisation',
    });
    const names = compact.tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['get_rules', 'get_my_dues', 'pay_contribution']));
    expect(names).not.toContain('propose_change');
    expect(names).not.toContain('schedule_meeting');
  });

  it('keeps this turn’s work, with long results cut, and drops old history first', () => {
    const work: LlmMessage[] = [
      {
        role: 'assistant',
        content: null,
        toolCalls: [{ id: 'c1', name: 'propose_change', arguments: '{}' }],
        by: 'openrouter',
      },
      { role: 'tool', toolCallId: 'c1', content: 'R'.repeat(9_000) },
    ];
    const full = request();
    const asked = full.messages.slice(0, 4);
    const compact = compactRequest({ ...full, messages: [...asked, ...work] }, 3_000);
    const roles = compact.messages.map((m) => m.role);
    expect(roles.slice(-3)).toEqual(['user', 'assistant', 'tool']);
    const result = compact.messages.at(-1) as { content: string };
    expect(result.content.length).toBeLessThan(2_000);
    expect(result.content.endsWith('[cut]')).toBe(true);
    // A tool already used in the turn stays available even though its topic was not asked.
    expect(compact.tools.map((t) => t.name)).toContain('propose_change');
    // The old exchange was the first thing to go.
    expect(JSON.stringify(compact.messages)).not.toContain('ancien message');
  });

  it('fits the budget whatever the message is about', () => {
    for (const text of ['Bonjour', 'payer prêt vote réunion message compte', 'règles du groupe']) {
      const full = request({ messages: [system, { role: 'user', content: text }] });
      const compact = compactRequest(full, 1_800);
      expect(estimateTokens(compact)).toBeLessThanOrEqual(1_800);
    }
  });

  it('always keeps the last assistant reply even on a tiny budget (agent sees its own question)', () => {
    // This is the exact bug: user says "Yes" after the agent asked a question. With a tiny
    // token budget (like Groq's old 3 500 default), ALL history was dropped, so the agent had
    // no context for "Yes". The fix guarantees MIN_HISTORY_LINES are always present.
    const agentQuestion: LlmMessage = {
      role: 'assistant',
      content: 'Veux-tu que je montre le solde de ta caisse ?',
    };
    const full: LlmRequest = {
      ...request(),
      messages: [
        system,
        { role: 'user', content: 'ancien message '.repeat(60) },
        agentQuestion,
        { role: 'user', content: 'Oui' },
      ],
    };
    // Budget so tight that only system + current message would normally fit.
    const compact = compactRequest(full, 800);
    const content = JSON.stringify(compact.messages);
    // The agent's question must still be present so it knows what "Oui" refers to.
    expect(content).toContain('Veux-tu que je montre le solde');
    // The old noisy history may be dropped — that is fine.
    expect(content).not.toContain('ancien message');
  });

  it('a "yes" answer always has at least the last 4 history lines for context', () => {
    // Build a conversation where the agent asked several questions; check MIN_HISTORY_LINES apply.
    const historyLines: LlmMessage[] = [
      { role: 'user', content: 'msg1 '.repeat(20) },
      { role: 'assistant', content: 'rep1 '.repeat(20) },
      { role: 'user', content: 'msg2 '.repeat(20) },
      { role: 'assistant', content: 'rep2 — Veux-tu continuer ?' },
    ];
    const full: LlmRequest = {
      ...request(),
      messages: [system, ...historyLines, { role: 'user', content: 'Oui' }],
    };
    // Tight budget — history would be dropped without the guarantee.
    const compact = compactRequest(full, 1_200);
    const msgStr = JSON.stringify(compact.messages);
    // At least the last assistant reply (the question the user is answering) must survive.
    expect(msgStr).toContain('Veux-tu continuer');
    expect(msgStr).toContain('msg2');
  });

  it('keeps the relevant action tool when the member replies "Oui" or "Yes" to an assistant offer', () => {
    const full: LlmRequest = {
      ...request(),
      messages: [
        system,
        { role: 'user', content: 'Je dois combien ?' },
        {
          role: 'assistant',
          content: 'Tu dois 11 000 FCFA pour ta cotisation. Je prépare le paiement ?',
        },
        { role: 'user', content: 'Oui' },
      ],
    };
    const compact = compactRequest(full, 1_800);
    const names = compact.tools.map((t) => t.name);
    expect(names).toContain('pay_contribution');
    expect(JSON.stringify(compact.messages)).toContain('Je prépare le paiement ?');
  });

  it('never sends the tool category to the provider', () => {
    const body = toChatBody(request());
    expect(JSON.stringify(body)).not.toContain('category');
  });
});

describe('handover to another provider', () => {
  const calls = [{ id: 'c1', name: 'get_rules', arguments: '{}' }];
  const midTurn = (by: string): LlmMessage[] => [
    system,
    { role: 'user', content: 'Quelles sont les règles ?' },
    { role: 'assistant', content: null, toolCalls: calls, by },
    { role: 'tool', toolCallId: 'c1', content: '{"cotisation":"10 000 FCFA"}' },
  ];

  it('knows when work in this turn was done by someone else', () => {
    expect(isTakingOver(midTurn('openrouter'), 'groq')).toBe(true);
    expect(isTakingOver(midTurn('groq'), 'groq')).toBe(false);
    expect(isTakingOver([system, { role: 'user', content: 'hi' }], 'groq')).toBe(false);
  });

  it('adds the note to the system message without touching the rest', () => {
    const out = withHandoverNote(midTurn('openrouter'));
    expect((out[0] as { content: string }).content.endsWith(HANDOVER_NOTE)).toBe(true);
    expect(out.slice(1)).toEqual(midTurn('openrouter').slice(1));
  });

  it('the failover gives the second provider the first one’s tool results and the note', async () => {
    const seen: LlmRequest[] = [];
    const a: FailoverMember = {
      name: 'openrouter',
      model: 'a',
      client: {
        name: 'a',
        chat: () => Promise.reject(new (class extends Error {})('x')),
      },
    };
    const reply: LlmResponse = {
      text: 'Cotisation : 10 000 FCFA.',
      toolCalls: [],
      finishReason: 'stop',
    };
    const b: FailoverMember = {
      name: 'groq',
      model: 'b',
      maxInputTokens: 50_000,
      client: {
        name: 'b',
        chat: (req) => {
          seen.push(req);
          return Promise.resolve(reply);
        },
      },
    };
    const llm = new FailoverLlm([a, b], { memberTimeoutMs: 1_000 });
    const res = await llm.chat({ ...request(), messages: midTurn('openrouter') });
    expect(res.provider).toBe('groq');
    const sent = seen[0]!;
    expect(sent.model).toBe('b');
    expect((sent.messages[0] as { content: string }).content).toContain('[Handover]');
    expect(JSON.stringify(sent.messages)).toContain('10 000 FCFA');
  });
});

describe('Google thought signatures', () => {
  const calls = [
    { id: 'c1', name: 'get_rules', arguments: '{}', signature: 'sig-from-gemini' },
    { id: 'c2', name: 'get_my_dues', arguments: '{}' },
  ];
  const req: LlmRequest = {
    model: 'm',
    purpose: 'turn',
    temperature: 0.2,
    tools: [],
    messages: [
      { role: 'user', content: 'q' },
      { role: 'assistant', content: null, toolCalls: calls },
    ],
  };

  it('replays Gemini’s own signature and a placeholder for another model’s call', () => {
    const body = toChatBody(req, { googleSignatures: true });
    const wire = (body.messages[1] as { tool_calls: Record<string, unknown>[] }).tool_calls;
    expect(wire[0]!.extra_content).toEqual({ google: { thought_signature: 'sig-from-gemini' } });
    expect(wire[1]!.extra_content).toEqual({
      google: { thought_signature: GOOGLE_SKIP_SIGNATURE },
    });
  });

  it('sends nothing of the kind to the other providers', () => {
    expect(JSON.stringify(toChatBody(req))).not.toContain('thought_signature');
  });
});

describe('trimming a wrapped tool result', () => {
  it('keeps the closing tag, so the result stays a block', () => {
    const long = `<tool_result name="get_ledger">\n${'x'.repeat(6_000)}\n</tool_result>`;
    const full: LlmRequest = {
      model: 'm',
      purpose: 'turn',
      temperature: 0.2,
      tools: [],
      messages: [
        { role: 'system', content: 'S' },
        { role: 'user', content: 'q' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [{ id: 'c1', name: 'get_ledger', arguments: '{}' }],
        },
        { role: 'tool', toolCallId: 'c1', content: long },
      ],
    };
    const compact = compactRequest(full, 1_000);
    const result = (compact.messages.at(-1) as { content: string }).content;
    expect(result.length).toBeLessThan(2_000);
    expect(result.startsWith('<tool_result name="get_ledger">')).toBe(true);
    expect(result.endsWith('</tool_result>')).toBe(true);
    expect(result).toContain('[cut]');
  });
});
