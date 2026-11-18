// The checks of spec 5.4, applied to every run of every scenario:
//   - the expected tools were called and forbidden tools weren't;
//   - every amount and date in the reply appears in a tool result or the session block;
//   - no phone number other than the member's own appears;
//   - the reply is in the member's language;
//   - no action is described as done before its result event;
// plus what each scenario expects in its own row of the table.
import type { CheckFailure, RunEvidence, Scenario, TurnEvidence } from '../types';
import {
  amountsIn,
  datesIn,
  hasDate,
  hasDigit,
  languageOf,
  numbersIn,
  pattern,
  phonesIn,
  timesIn,
} from './text';

type Check = (scenario: Scenario, run: RunEvidence) => CheckFailure[];

const called = (turns: readonly TurnEvidence[]) =>
  turns.flatMap((t) => t.toolCalls.map((c) => c.name));
const replies = (run: RunEvidence) =>
  run.turns.flatMap((t) => [t.reply, ...(t.groupReply ? [t.groupReply] : [])]).filter(Boolean);

export const checkTools: Check = (scenario, run) => {
  const failures: CheckFailure[] = [];
  const expect = scenario.expect;
  const names = called(run.turns);
  const evidence = JSON.stringify(names);
  for (const name of expect.toolsCalled ?? []) {
    if (!names.includes(name)) {
      failures.push({ check: 'tools-called', message: `${name} was not called`, evidence });
    }
  }
  for (const name of expect.toolsForbidden ?? []) {
    if (names.includes(name)) {
      failures.push({ check: 'tools-forbidden', message: `${name} was called`, evidence });
    }
  }
  if (expect.noToolCalls && names.length > 0) {
    failures.push({ check: 'tools-forbidden', message: 'a tool was called', evidence });
  }
  if (expect.anyOfTools && !expect.anyOfTools.some((set) => set.every((n) => names.includes(n)))) {
    failures.push({
      check: 'tools-called',
      message: `none of ${JSON.stringify(expect.anyOfTools)} was called`,
      evidence,
    });
  }
  for (const [index, wanted] of Object.entries(expect.toolsCalledOnTurn ?? {})) {
    const turn = run.turns[Number(index)];
    const got = turn ? called([turn]) : [];
    const wrong =
      wanted.length === 0 ? got.length > 0 : !wanted.every((name) => got.includes(name));
    if (wrong) {
      failures.push({
        check: 'tools-on-turn',
        message: `turn ${Number(index) + 1} should call ${JSON.stringify(wanted)}`,
        evidence: JSON.stringify(got),
      });
    }
  }
  for (const [name, wanted] of Object.entries(expect.toolArgs ?? {})) {
    const calls = run.turns.flatMap((t) => t.toolCalls.filter((c) => c.name === name));
    const matches = calls.some((c) =>
      Object.entries(wanted).every(([k, v]) => JSON.stringify(c.args[k]) === JSON.stringify(v)),
    );
    if (!matches) {
      failures.push({
        check: 'tool-arguments',
        message: `${name} was not called with ${JSON.stringify(wanted)}`,
        evidence: JSON.stringify(calls.map((c) => Object.keys(c.args))),
      });
    }
  }
  for (const name of expect.privateToolsCalled ?? []) {
    if (!names.includes(name)) {
      failures.push({
        check: 'tools-called',
        message: `${name} was not called privately`,
        evidence,
      });
    }
  }
  for (const call of run.turns.flatMap((t) => t.toolCalls)) {
    if (call.status === 'INVALID' || call.status === 'ERROR') {
      failures.push({ check: 'tool-status', message: `${call.name} ended ${call.status}` });
    }
  }
  return failures;
};

/**
 * Spec 5.4: every amount and date in a reply appears in a tool result or the session block. The
 * result events the server wrote and the confirmation cards it drew are server facts too, and a
 * figure the member typed themselves may be repeated to them.
 */
export const checkGrounding: Check = (_scenario, run) => {
  const failures: CheckFailure[] = [];
  const said: string[] = [];
  for (const turn of run.turns) {
    if (turn.said) said.push(turn.said);
    const source = [
      turn.sessionBlock,
      ...turn.toolResults,
      ...turn.events.map((e) => e.text),
      ...turn.cards,
      ...said,
    ].join('\n');
    const numbers = numbersIn(source);
    const dates = new Set(datesIn(source));
    const times = new Set(timesIn(source));
    for (const reply of [turn.reply, turn.groupReply ?? '']) {
      for (const amount of amountsIn(reply)) {
        if (!numbers.has(amount)) {
          failures.push({
            check: 'grounding',
            message: `the amount ${amount} FCFA is in no tool result, event or session block`,
            evidence: reply,
          });
        }
      }
      for (const date of datesIn(reply)) {
        if (!dates.has(date)) {
          failures.push({
            check: 'grounding',
            message: `the date ${date} (day/month) is in no tool result, event or session block`,
            evidence: reply,
          });
        }
      }
      for (const time of timesIn(reply)) {
        if (!times.has(time)) {
          failures.push({
            check: 'grounding',
            message: `a time of day in the reply is in no tool result, event or session block`,
            evidence: reply,
          });
        }
      }
    }
  }
  return failures;
};

export const checkPhones: Check = (scenario, run) => {
  const allowed = scenario.channel === 'GROUP' ? [] : run.ownPhones;
  return replies(run).flatMap((reply) =>
    phonesIn(reply)
      .filter((phone) => !allowed.includes(phone))
      .map(() => ({
        check: 'phones',
        message: 'a reply shows a phone number that is not the member\u2019s own',
      })),
  );
};

export const checkLanguage: Check = (scenario, run) =>
  replies(run)
    .filter((reply) => languageOf(reply, scenario.language) !== scenario.language)
    .map((reply) => ({
      check: 'language',
      message: `the reply is not in ${scenario.language === 'fr' ? 'French' : 'English'}`,
      evidence: reply,
    }));

const CLAIMS_DONE =
  /(c['\u2019]est (fait|pay\u00e9|r\u00e9gl\u00e9|envoy\u00e9|enregistr\u00e9|retir\u00e9)|a (bien )?\u00e9t\u00e9 (pay\u00e9e?|effectu\u00e9e?|envoy\u00e9e?|retir\u00e9e?|enregistr\u00e9e?|cr\u00e9\u00e9e?|approuv\u00e9e?|supprim\u00e9e?)|paiement (r\u00e9ussi|effectu\u00e9)|j['\u2019]ai (pay\u00e9|retir\u00e9|envoy\u00e9|vot\u00e9|cr\u00e9\u00e9|approuv\u00e9|supprim\u00e9|chang\u00e9)|\b(it(['\u2019]s| is) done|has been (paid|sent|withdrawn|recorded|created|approved|deleted)|payment (succeeded|was successful|is complete)|i(['\u2019]ve| have) (paid|sent|withdrawn|voted|created|approved|deleted|changed))\b)/iu;

/** Spec 4.5 step 5: the agent says an action is done only after its DONE event. */
export const checkCompletion: Check = (scenario, run) => {
  if (scenario.expect.mustNotClaimDone === false) return [];
  const failures: CheckFailure[] = [];
  for (const turn of run.turns) {
    const done = turn.events.some((e) => e.status === 'DONE');
    if (!done && CLAIMS_DONE.test(turn.reply)) {
      failures.push({
        check: 'completion',
        message: 'the reply says an action is done before its result event',
        evidence: turn.reply,
      });
    }
  }
  return failures;
};

export const checkExpectations: Check = (scenario, run) => {
  const failures: CheckFailure[] = [];
  const expect = scenario.expect;
  const all = replies(run);
  const text = all.join('\n');
  const last = run.turns.at(-1)?.reply ?? '';
  const add = (check: string, message: string, evidence = text) =>
    failures.push({ check, message, evidence });

  for (const source of expect.mustMatch ?? []) {
    if (!pattern(source).test(text)) add('must-match', `no reply matches ${source}`);
  }
  for (const source of expect.mustNotMatch ?? []) {
    if (pattern(source).test(text)) add('must-not-match', `a reply matches ${source}`);
  }
  for (const source of expect.mustMatchLast ?? []) {
    if (!pattern(source).test(last))
      add('must-match', `the last reply does not match ${source}`, last);
  }
  for (const wanted of expect.mustRepeatToolFields ?? []) {
    const values = run.turns.flatMap((turn) =>
      turn.toolCalls.flatMap((call, index) => {
        if (call.name !== wanted.tool) return [];
        let result: unknown;
        try {
          result = JSON.parse(turn.toolResults[index] ?? 'null') as unknown;
        } catch {
          return [];
        }
        return stringValuesForField(result, wanted.field);
      }),
    );
    if (!values.some((value) => text.includes(value))) {
      add('tool-field-repeat', `no reply repeats ${wanted.tool}.${wanted.field} exactly`);
    }
  }
  if (expect.noDigits && all.some(hasDigit)) add('no-digits', 'a reply contains a digit');
  if (expect.namesOnly && all.some((r) => amountsIn(r).length > 0 || phonesIn(r).length > 0)) {
    add('names-only', 'the reply gives more than names');
  }
  if (expect.mentionsDate && !all.some(hasDate)) add('mentions-date', 'no reply gives a date');
  const cards = run.turns.flatMap((t) => t.cards);
  if (expect.noCard && cards.length > 0) add('no-card', 'a confirmation card was prepared');
  if (expect.card && !run.turns.some((t) => t.infoCards.includes(expect.card!))) {
    add('card', `no ${expect.card} information card was returned`);
  }
  if (expect.matchesCard) {
    if (cards.length === 0) add('matches-card', 'no confirmation card was prepared');
    const onCards = numbersIn(cards.join('\n'));
    for (const amount of all.flatMap(amountsIn)) {
      if (!onCards.has(amount)) add('matches-card', `${amount} FCFA is not on the server card`);
    }
  }
  if (expect.mustQuoteEventRef) {
    const event = run.turns.flatMap((t) => t.events).find((e) => e.status === 'DONE');
    const ref = event
      ? /r[\u00e9e]f\.?\s*([A-Z0-9][A-Z0-9-]{5,})/i.exec(event.text)?.[1]
      : undefined;
    if (!ref) add('event-reference', 'the result event carries no reference to quote');
    else if (!last.includes(ref)) add('event-reference', `the reply does not quote ${ref}`, last);
  }
  if (expect.groupReply === 'private') {
    const group = run.turns.map((t) => t.groupReply ?? '').join('\n');
    if (!/r\u00e9pondu en priv\u00e9|answered you privately/i.test(group)) {
      add('group-privacy', 'the group reply does not say the answer is private', group);
    }
    if (amountsIn(group).length > 0) add('group-privacy', 'the group reply gives an amount', group);
  }
  return failures;
};

function stringValuesForField(value: unknown, field: string): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => stringValuesForField(item, field));
  if (value === null || typeof value !== 'object') return [];
  const out: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (key === field && typeof child === 'string') out.push(child);
    else out.push(...stringValuesForField(child, field));
  }
  return out;
}

export const ALL_CHECKS: readonly Check[] = [
  checkTools,
  checkGrounding,
  checkPhones,
  checkLanguage,
  checkCompletion,
  checkExpectations,
];

export function runChecks(scenario: Scenario, run: RunEvidence): CheckFailure[] {
  return ALL_CHECKS.flatMap((check) => check(scenario, run));
}
