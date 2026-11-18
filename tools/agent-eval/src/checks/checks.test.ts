import { describe, expect, it } from 'vitest';
import { runScenario, runEvaluation, skipReason, type AgentDriver } from '../harness';
import { loadScenarios } from '../scenarios';
import { scriptedAnswer, ScriptError } from '../script';
import {
  NotAvailable,
  type Need,
  type RunEvidence,
  type Scenario,
  type TurnEvidence,
} from '../types';
import { runChecks } from './index';
import { amountsIn, datesIn, languageOf, timesIn } from './text';

const OWN = '+237699000103';

function turn(patch: Partial<TurnEvidence> = {}): TurnEvidence {
  return {
    index: 0,
    kind: 'user',
    said: 'Je dois combien ?',
    reply: 'Tu dois 11 000 FCFA avant le vendredi 6 novembre \u00e0 18 h.',
    groupReply: null,
    toolCalls: [{ name: 'get_my_overview', status: 'OK', args: {} }],
    cards: [],
    infoCards: [],
    sessionBlock: '<session>\nuser: Paul (fr, MEMBER)\n</session>',
    toolResults: [
      '{"status":"OK","due":"11\u202f000\u00a0FCFA","deadline":"vendredi 6 novembre 18:00"}',
    ],
    events: [],
    ...patch,
  };
}

function scenario(expect: Scenario['expect'] = {}, patch: Partial<Scenario> = {}): Scenario {
  return {
    id: 'S01',
    title: 'test',
    channel: 'PRIVATE',
    member: 'paul',
    language: 'fr',
    needs: [],
    turns: [{ user: 'Je dois combien ?' }],
    expect,
    script: [[]],
    ...patch,
  };
}

const run = (...turns: TurnEvidence[]): RunEvidence => ({ ownPhones: [OWN], turns });
const failed = (s: Scenario, r: RunEvidence) => runChecks(s, r).map((f) => f.check);

describe('reading facts out of replies', () => {
  it('reads amounts in French and English formats', () => {
    expect(amountsIn('Tu dois 11\u202f000 FCFA et 500 FCFA.')).toEqual(['11000', '500']);
    expect(amountsIn('You owe 1,250,000 FCFA.')).toEqual(['1250000']);
    expect(amountsIn('le tour 4, sur 3 mois')).toEqual([]);
  });
  it('reads dates and times whatever the wording', () => {
    expect(datesIn('vendredi 6 novembre')).toEqual(['6/11']);
    expect(datesIn('Friday 6 November, or November 7')).toEqual(['6/11', '7/11']);
    expect(timesIn('\u00e0 18 h, at 6 pm, 18:00')).toEqual([1080, 1080, 1080]);
  });
  it('tells French from English', () => {
    expect(languageOf('Tu dois payer avant vendredi.', 'en')).toBe('fr');
    expect(languageOf('The solidarity fund holds your money.', 'fr')).toBe('en');
  });
});

describe('the checks of spec 5.4', () => {
  it('passes a grounded reply with the expected tool', () => {
    expect(failed(scenario({ toolsCalled: ['get_my_overview'] }), run(turn()))).toEqual([]);
  });
  it('fails a missing tool, a forbidden tool and wrong arguments', () => {
    const s = scenario({
      toolsCalled: ['pay'],
      toolsForbidden: ['get_my_overview'],
      toolArgs: { get_my_overview: { scope: 'all' } },
    });
    expect(failed(s, run(turn()))).toEqual(['tools-called', 'tools-forbidden', 'tool-arguments']);
  });
  it('requires exact hold/deadline strings to be repeated from tool results', () => {
    const exact = scenario({ mustRepeatToolFields: [{ tool: 'withdraw', field: 'holdEnds' }] });
    const grounded = turn({
      reply: 'Le retrait attend jusqu’à jeudi 19 novembre à 14 h 39.',
      toolCalls: [{ name: 'withdraw', status: 'REFUSED', args: {} }],
      toolResults: [JSON.stringify({ status: 'REFUSED', holdEnds: 'jeudi 19 novembre à 14 h 39' })],
    });
    expect(failed(exact, run(grounded))).toEqual([]);
    expect(
      failed(
        exact,
        run(
          turn({
            ...grounded,
            reply: 'Le retrait attend jusqu’à minuit.',
          }),
        ),
      ),
    ).toEqual(['tool-field-repeat']);
  });
  it('fails an amount, a date or a time that no tool result holds', () => {
    expect(failed(scenario(), run(turn({ reply: 'Tu dois 12 000 FCFA.' })))).toEqual(['grounding']);
    expect(failed(scenario(), run(turn({ reply: 'Avant le 9 novembre.' })))).toEqual(['grounding']);
    expect(failed(scenario(), run(turn({ reply: 'Avant vendredi \u00e0 19 h.' })))).toEqual([
      'grounding',
    ]);
  });
  it('lets the member\u2019s own typed figure and own number through, and no other number', () => {
    const typed = turn({
      said: 'Retire 20 000 FCFA',
      reply: 'Je pr\u00e9pare le retrait de 20 000 FCFA.',
    });
    expect(failed(scenario(), run(typed))).toEqual([]);
    expect(
      failed(scenario(), run(turn({ reply: 'Ton num\u00e9ro est le 699 00 01 03.' }))),
    ).toEqual([]);
    expect(failed(scenario(), run(turn({ reply: 'Appelle le 677 12 34 56.' })))).toEqual([
      'phones',
    ]);
  });
  it('fails a reply in the wrong language', () => {
    expect(
      failed(scenario(), run(turn({ reply: 'You have nothing to pay for this round.' }))),
    ).toEqual(['language']);
  });
  it('fails a completion claim before the result event, and accepts it after', () => {
    const claim = { reply: 'C\u2019est fait, le paiement a \u00e9t\u00e9 effectu\u00e9.' };
    expect(failed(scenario(), run(turn(claim)))).toEqual(['completion']);
    const after = turn({
      ...claim,
      events: [{ status: 'DONE', text: 'Pay\u00e9, r\u00e9f. MP261106' }],
    });
    expect(failed(scenario(), run(after))).toEqual([]);
  });
  it('checks digits, cards, the event reference and the group reply', () => {
    expect(failed(scenario({ noDigits: true }), run(turn()))).toEqual(['no-digits']);
    expect(failed(scenario({ matchesCard: true }), run(turn()))).toContain('matches-card');
    const card = turn({ cards: ['{"total":"11\u202f000\u00a0FCFA"}'] });
    expect(failed(scenario({ matchesCard: true }), run(card))).toEqual([]);
    const event = turn({
      reply: 'Paiement re\u00e7u.',
      events: [{ status: 'DONE', text: 'Pay\u00e9, r\u00e9f. MP261106XY' }],
    });
    expect(failed(scenario({ mustQuoteEventRef: true }), run(event))).toEqual(['event-reference']);
    const group = turn({
      reply: 'Voici.',
      groupReply: 'Tu as 5 000 FCFA de dettes.',
      toolResults: ['"5 000 FCFA"'],
    });
    expect(failed(scenario({ groupReply: 'private' }, { channel: 'GROUP' }), run(group))).toEqual([
      'group-privacy',
      'group-privacy',
    ]);
  });
});

describe('the scripted model', () => {
  const sent = [
    { role: 'system', content: 'x' },
    { role: 'user', content: 'Je dois combien ?' },
    {
      role: 'tool',
      content:
        '<tool_result name="get_my_overview">\n{"status":"OK","due":"11\u202f000\u00a0FCFA","deadline":"vendredi 6 novembre"}\n</tool_result>',
    },
  ];
  it('fills a reply only from what the server sent', () => {
    const steps = [
      { tools: [{ name: 'get_my_overview' }] },
      { reply: 'Tu dois {{amount:due}}, avant {{date:deadline}}.' },
    ];
    expect(scriptedAnswer(steps, 0, sent.slice(0, 2)).toolCalls).toEqual([
      { name: 'get_my_overview', args: {} },
    ]);
    expect(scriptedAnswer(steps, 1, sent).text).toBe(
      'Tu dois 11\u202f000\u00a0FCFA, avant vendredi 6 novembre.',
    );
  });
  it('refuses to invent a fact the server did not send', () => {
    expect(() => scriptedAnswer([{ reply: '{{amount:total}}' }], 0, sent)).toThrow(ScriptError);
    expect(() => scriptedAnswer([{ reply: '{{event}}' }], 0, sent)).toThrow(ScriptError);
  });
});

describe('the harness', () => {
  const driver = (built: Need[], open: AgentDriver['open']): AgentDriver => ({
    capabilities: () => Promise.resolve(new Set(built)),
    open,
    close: () => Promise.resolve(),
  });
  const session = (reply: string) => () =>
    Promise.resolve({
      ownPhones: [OWN],
      say: () => Promise.resolve({ ...turn({ reply }), index: undefined } as never),
      event: () => Promise.reject(new NotAvailable('no events')),
    });

  it('loads exactly the 30 scenarios of spec 5.4', () => {
    const scenarios = loadScenarios();
    expect(scenarios.map((s) => s.id)).toEqual(
      Array.from({ length: 30 }, (_x, i) => `S${String(i + 1).padStart(2, '0')}`),
    );
    expect(scenarios.filter((s) => s.channel === 'GROUP').map((s) => s.id)).toEqual(['S04', 'S24']);
  });
  it('skips a scenario whose services are not built, once, and never passes it', async () => {
    const s = scenario({}, { needs: ['money'] });
    expect(skipReason(s, new Set())).toMatch(/money services/);
    const records = await runEvaluation(driver([], session('x')), [s]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ status: 'SKIPPED' });
  });
  it('runs a scenario three times and reports each run', async () => {
    const records = await runEvaluation(driver([], session('Tu dois 11 000 FCFA.')), [scenario()]);
    expect(records.map((r) => r.status)).toEqual(['PASS', 'PASS', 'PASS']);
  });
  it('reports a step the driver cannot play as skipped, and a broken run as failed', async () => {
    const skipping = driver([], () => Promise.reject(new NotAvailable('group chat')));
    expect((await runScenario(skipping, scenario(), 1)).status).toBe('SKIPPED');
    const broken = driver([], () => Promise.reject(new Error('database down')));
    expect(await runScenario(broken, scenario(), 1)).toMatchObject({
      status: 'FAIL',
      failures: [{ check: 'run' }],
    });
  });
});
