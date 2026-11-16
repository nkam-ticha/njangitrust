// The evaluation report: one line per scenario on the console, and a JSON and a Markdown file.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { RunRecord } from './types';

export interface Report {
  mode: 'scripted' | 'live';
  model: string | null;
  promptVersion: string | null;
  generatedAt: string;
  /** True only when every run that ran passed. Skipped scenarios are listed, never counted. */
  passed: boolean;
  /** True when all 30 scenarios ran and passed: the gate of spec 4.11 and 5.4. */
  complete: boolean;
  counts: { scenarios: number; ran: number; passed: number; failed: number; skipped: number };
  runs: RunRecord[];
}

export function makeReport(
  runs: RunRecord[],
  meta: Pick<Report, 'mode' | 'model' | 'promptVersion' | 'generatedAt'>,
): Report {
  const byScenario = new Map<string, RunRecord[]>();
  for (const run of runs)
    byScenario.set(run.scenario, [...(byScenario.get(run.scenario) ?? []), run]);
  const groups = [...byScenario.values()];
  const skipped = groups.filter((g) => g.some((r) => r.status === 'SKIPPED')).length;
  const failed = groups.filter((g) => g.some((r) => r.status === 'FAIL')).length;
  const passed = groups.filter((g) => g.every((r) => r.status === 'PASS')).length;
  return {
    ...meta,
    passed: failed === 0,
    complete: failed === 0 && skipped === 0,
    counts: { scenarios: groups.length, ran: groups.length - skipped, passed, failed, skipped },
    runs,
  };
}

export function summaryLine(report: Report): string {
  const c = report.counts;
  const verdict = !report.passed ? 'FAIL' : report.complete ? 'PASS' : 'INCOMPLETE';
  return `${verdict}: ${c.passed} of ${c.scenarios} scenarios passed every run, ${c.failed} failed, ${c.skipped} skipped (${report.mode} mode)`;
}

export function markdownReport(report: Report): string {
  const lines = [
    '# Njangi agent evaluation',
    '',
    `- Mode: ${report.mode}${report.model ? `, model \`${report.model}\`` : ''}`,
    `- Prompt version: ${report.promptVersion ?? 'unknown'}`,
    `- Date: ${report.generatedAt}`,
    `- Result: **${summaryLine(report)}**`,
    '',
    '| Scenario | Run | Result | Detail |',
    '|---|---:|---|---|',
  ];
  for (const run of report.runs) {
    const detail =
      run.status === 'SKIPPED'
        ? (run.reason ?? '')
        : run.failures.map((f) => `${f.check}: ${f.message}`).join('<br>') || '-';
    lines.push(
      `| ${run.scenario} ${run.title.replace(/\|/g, '/')} | ${run.status === 'SKIPPED' ? '-' : run.run} | ${run.status} | ${detail.replace(/\|/g, '/')} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

export function writeReports(
  directory: string,
  report: Report,
): { json: string; markdown: string } {
  mkdirSync(directory, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, '-');
  const json = path.join(directory, `agent-eval-${report.mode}-${stamp}.json`);
  const markdown = path.join(directory, `agent-eval-${report.mode}-${stamp}.md`);
  writeFileSync(json, JSON.stringify(report, null, 2));
  writeFileSync(markdown, markdownReport(report));
  return { json, markdown };
}
