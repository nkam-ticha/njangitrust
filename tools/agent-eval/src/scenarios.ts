// Loads and validates the scenario file (spec 5.4: exactly 30 scenarios, numbered S01 to S30,
// plus S31–S33 (2026-11-18, conversational continuity) and S34–S39 (2026-11-22: a card for
// member add and admin change, a refused proposal told honestly, try-first, where-do-I-find in both
// languages)).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Need, Scenario } from './types';

export const SCENARIO_FILE = fileURLToPath(new URL('./scenarios/scenarios.json', import.meta.url));
export const SCENARIO_COUNT = 39;

const NEEDS: readonly Need[] = [
  'money',
  'cycles',
  'chat',
  'meetings',
  'statements',
  'account',
  'bidding',
  'demoChat',
];

function fail(id: string, message: string): never {
  throw new Error(`Scenario ${id}: ${message}`);
}

export function parseScenarios(raw: unknown): Scenario[] {
  const list = (raw as { scenarios?: unknown }).scenarios;
  if (!Array.isArray(list)) throw new Error('The scenario file must hold a "scenarios" array');
  const scenarios = list as Scenario[];
  scenarios.forEach((s, index) => {
    const id = typeof s.id === 'string' ? s.id : `#${index + 1}`;
    if (id !== `S${String(index + 1).padStart(2, '0')}`) fail(id, 'ids must run from S01 in order');
    if (s.channel !== 'PRIVATE' && s.channel !== 'GROUP') fail(id, 'unknown channel');
    if (s.language !== 'fr' && s.language !== 'en') fail(id, 'unknown language');
    if (typeof s.member !== 'string' || typeof s.title !== 'string') fail(id, 'member and title');
    if (!Array.isArray(s.needs) || s.needs.some((n) => !NEEDS.includes(n))) fail(id, 'bad needs');
    if (!Array.isArray(s.turns) || s.turns.length === 0) fail(id, 'needs at least one turn');
    if (s.turns.some((t) => (t.user === undefined) === (t.event === undefined))) {
      fail(id, 'each turn is either a member message or an event');
    }
    if (!Array.isArray(s.script) || s.script.length !== s.turns.length) {
      fail(id, 'the script needs one list of steps per turn');
    }
    if (typeof s.expect !== 'object' || s.expect === null) fail(id, 'expect is missing');
  });
  if (scenarios.length !== SCENARIO_COUNT) {
    throw new Error(`Spec 5.4 has ${SCENARIO_COUNT} scenarios; the file has ${scenarios.length}`);
  }
  return scenarios;
}

export function loadScenarios(file: string = SCENARIO_FILE): Scenario[] {
  return parseScenarios(JSON.parse(readFileSync(file, 'utf8')));
}
