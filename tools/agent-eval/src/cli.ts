// pnpm agent:eval [--scripted] [--only S05,S13] [--runs 3] [--out reports]
// Live mode (the default) calls the configured model through OpenRouter. Scripted mode needs no
// key: a scripted model stands in, so the harness, the runtime, the tools and the guards are
// exercised deterministically. The exit code is 0 only when every run that ran passed.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RUNS_PER_SCENARIO, runEvaluation, type AgentDriver } from './harness';
import { makeReport, summaryLine, writeReports } from './report';
import { loadScenarios } from './scenarios';

interface EvaluationDriver extends AgentDriver {
  model: string | null;
  promptVersion: string;
}
interface DriverModule {
  openDriver(mode: 'scripted' | 'live'): EvaluationDriver | null;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => (flag(name) ? args[args.indexOf(name) + 1] : undefined);
const print = (line: string) => process.stdout.write(`${line}\n`);

const NO_KEY = [
  'Njangi is not configured, so the live evaluation cannot run.',
  '',
  '  1. Put these two lines in apps/api/.env (and in the API environment on Vercel):',
  '       OPENROUTER_API_KEY=<your OpenRouter key>',
  '       OPENROUTER_MODEL=<a model id from openrouter.ai/models, see docs/AGENT.md>',
  '  2. Run:  pnpm agent:smoke     (one harmless message through the real API)',
  '  3. Run:  pnpm agent:eval      (the 30 scenarios, three times each)',
  '',
  'Without a key you can still run:  pnpm agent:eval --scripted',
].join('\n');

async function main(): Promise<number> {
  const mode = flag('--scripted') ? 'scripted' : 'live';
  const only = value('--only')
    ?.split(',')
    .map((id) => id.trim().toUpperCase());
  const runs = Number(value('--runs') ?? RUNS_PER_SCENARIO);
  if (!Number.isInteger(runs) || runs < 1)
    throw new Error('--runs must be a whole number, 1 or more');
  const scenarios = loadScenarios().filter((s) => !only || only.includes(s.id));
  if (scenarios.length === 0) throw new Error('No scenario matches --only');

  // The driver is the API's own code (apps/api/src/agent/evaluation/driver.ts), loaded at run time
  // so that this package type-checks on its own.
  const driverFile = path.resolve(here, '../../../apps/api/src/agent/evaluation/driver.ts');
  const driverModule = (await import(pathToFileURL(driverFile).href)) as DriverModule;
  const driver = driverModule.openDriver(mode);
  if (!driver) {
    print(NO_KEY);
    return 1;
  }
  print(`Njangi agent evaluation, ${mode} mode${driver.model ? `, model ${driver.model}` : ''}`);
  print(`${scenarios.length} scenarios, ${runs} runs each. Prompt ${driver.promptVersion}.`);
  print('');
  try {
    const records = await runEvaluation(driver, scenarios, {
      runs,
      onRecord: (r) => {
        const detail =
          r.status === 'SKIPPED'
            ? r.reason
            : r.failures.map((f) => `${f.check}: ${f.message}`).join('; ');
        const run = r.status === 'SKIPPED' ? '   ' : `#${r.run} `;
        print(
          `${r.status.padEnd(7)} ${r.scenario} ${run}${r.title}${detail ? `  [${detail}]` : ''}`,
        );
      },
    });
    const report = makeReport(records, {
      mode,
      model: driver.model,
      promptVersion: driver.promptVersion,
      generatedAt: new Date().toISOString(),
    });
    const out = path.resolve(value('--out') ?? path.join(here, '..', 'reports'));
    const files = writeReports(out, report);
    print('');
    print(summaryLine(report));
    if (report.passed && !report.complete) {
      print('Skipped scenarios are not passes: the gate of spec 5.4 needs all 30 to run and pass.');
    }
    if (mode === 'scripted') {
      print('Scripted mode says nothing about a model. Run "pnpm agent:eval" with a key for that.');
    }
    print(`Report: ${files.markdown}`);
    return report.passed ? 0 : 1;
  } finally {
    await driver.close();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
