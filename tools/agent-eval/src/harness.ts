// Runs scenarios against a driver (spec 5.4): each scenario three times, every run checked. A
// scenario that needs a part of the app that is not built yet is SKIPPED with the reason; it is
// never counted as a pass.
import { runChecks } from './checks';
import { ScriptError } from './script';
import {
  NotAvailable,
  type Channel,
  type Need,
  type RunEvidence,
  type RunRecord,
  type Scenario,
  type ScriptStep,
  type TurnEvidence,
} from './types';

export const RUNS_PER_SCENARIO = 3;

/** One conversation of one member with the agent, from an empty history. */
export interface AgentSession {
  ownPhones: string[];
  /** The member says `text`. `steps`: the scripted model's steps for this turn (scripted mode). */
  say(text: string, steps: readonly ScriptStep[]): Promise<Omit<TurnEvidence, 'index'>>;
  /** The result of the action prepared before arrives (confirmed in the app, or failed). */
  event(
    status: 'DONE' | 'FAILED',
    steps: readonly ScriptStep[],
  ): Promise<Omit<TurnEvidence, 'index'>>;
}

export interface AgentDriver {
  /** Parts of the app that are built and registered on this server. */
  capabilities(): Promise<ReadonlySet<Need>>;
  /** Opens a fresh conversation; throws NotAvailable when the driver cannot play this scenario. */
  open(input: { member: string; channel: Channel; language: 'fr' | 'en' }): Promise<AgentSession>;
  close(): Promise<void>;
}

const NEED_NAMES: Record<Need, string> = {
  money: 'the money services (payments, funds, ledger, loans)',
  cycles: 'cycles and rounds',
  chat: 'the group chat port',
  meetings: 'meetings',
  statements: 'statements',
  account: 'account changes (payment number, deletion)',
  bidding: 'bidding mode',
  demoChat: 'chat messages in the demo data (pnpm demo:seed writes none yet)',
};

export function skipReason(scenario: Scenario, built: ReadonlySet<Need>): string | null {
  const missing = scenario.needs.filter((need) => !built.has(need));
  if (missing.length === 0) return null;
  return `not built yet: ${missing.map((need) => NEED_NAMES[need]).join('; ')}`;
}

export async function runScenario(
  driver: AgentDriver,
  scenario: Scenario,
  run: number,
): Promise<RunRecord> {
  const base = { scenario: scenario.id, title: scenario.title, run };
  const evidence: RunEvidence = { ownPhones: [], turns: [] };
  try {
    const session = await driver.open({
      member: scenario.member,
      channel: scenario.channel,
      language: scenario.language,
    });
    evidence.ownPhones = session.ownPhones;
    for (const [index, turn] of scenario.turns.entries()) {
      const steps = scenario.script[index] ?? [];
      const produced = turn.event
        ? await session.event(turn.event.status, steps)
        : await session.say(turn.user ?? '', steps);
      evidence.turns.push({ index, ...produced });
    }
  } catch (error) {
    if (error instanceof NotAvailable) {
      return { ...base, status: 'SKIPPED', reason: error.message, failures: [] };
    }
    const check = error instanceof ScriptError ? 'scripted-reply' : 'run';
    const raw = error instanceof Error ? error.message : 'the run stopped';
    const message = raw.replace(/\s+/g, ' ').trim();
    return { ...base, status: 'FAIL', failures: [{ check, message }], evidence };
  }
  const failures = runChecks(scenario, evidence);
  return { ...base, status: failures.length ? 'FAIL' : 'PASS', failures, evidence };
}

export async function runEvaluation(
  driver: AgentDriver,
  scenarios: readonly Scenario[],
  options: { runs?: number; onRecord?: (record: RunRecord) => void } = {},
): Promise<RunRecord[]> {
  const runs = options.runs ?? RUNS_PER_SCENARIO;
  const built = await driver.capabilities();
  const records: RunRecord[] = [];
  for (const scenario of scenarios) {
    const reason = skipReason(scenario, built);
    for (let run = 1; run <= runs; run += 1) {
      const record: RunRecord = reason
        ? {
            scenario: scenario.id,
            title: scenario.title,
            run,
            status: 'SKIPPED',
            reason,
            failures: [],
          }
        : await runScenario(driver, scenario, run);
      records.push(record);
      options.onRecord?.(record);
      // A skipped scenario is reported once.
      if (record.status === 'SKIPPED') break;
    }
  }
  return records;
}
