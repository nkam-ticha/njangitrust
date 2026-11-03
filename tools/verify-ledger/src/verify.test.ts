import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sampleExport } from './sample-export.test-support';
import { formatReport, runVerify } from './verify';

const dir = mkdtempSync(join(tmpdir(), 'verify-ledger-'));
function fileWith(
  data: unknown,
  name = `export-${Math.random().toString(36).slice(2)}.json`,
): string {
  const path = join(dir, name);
  writeFileSync(path, typeof data === 'string' ? data : JSON.stringify(data, null, 2), 'utf8');
  return path;
}

function run(args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = runVerify(args, { stdout: (s) => out.push(s), stderr: (s) => err.push(s) });
  return { code, out: out.join(''), err: err.join('') };
}

describe('verify-ledger (spec 2.14, 5.2)', () => {
  it('prints OK and the recomputed balances for an intact export', () => {
    const { code, out } = run([fileWith(sampleExport())]);
    expect(code).toBe(0);
    expect(out.split('\n')[0]).toBe('OK');
    expect(out).toContain('7 transactions, head seq 7');
    expect(out).toContain('cash:provider 3964'); // 4 × 10 900 − (39 136 + 500)
  });

  it('fails at the exact seq when any field of a stored transaction is changed, a posting included', () => {
    const original = sampleExport();
    const mutations: [string, (t: (typeof original.transactions)[number]) => unknown][] = [
      ['descriptionFr', (t) => ({ ...t, descriptionFr: `${t.descriptionFr}!` })],
      ['occurredAt', (t) => ({ ...t, occurredAt: '2026-11-02T09:00:00.000Z' })],
      ['metadata', (t) => ({ ...t, metadata: { ...t.metadata, x: 1 } })],
      [
        'posting amount',
        (t) => ({
          ...t,
          postings: t.postings.map((p, i) => (i === 0 ? { ...p, amount: p.amount - 1 } : p)),
        }),
      ],
      [
        'posting account',
        (t) => ({
          ...t,
          postings: t.postings.map((p, i) =>
            i === 0 ? { ...p, account: 'payable:member:M9' } : p,
          ),
        }),
      ],
      ['hash', (t) => ({ ...t, hash: '0'.repeat(64) })],
    ];
    for (const tx of original.transactions) {
      for (const [field, mutate] of mutations) {
        if (field.startsWith('posting') && tx.postings.length === 0) continue;
        const tampered = {
          ...original,
          transactions: original.transactions.map((t) => (t.seq === tx.seq ? mutate(t) : t)),
        };
        const { code, out } = run([fileWith(tampered)]);
        expect(code, `${field} at ${tx.seq}`).toBe(1);
        expect(out.split('\n')[1], `${field} at ${tx.seq}`).toMatch(new RegExp(`^seq ${tx.seq} `));
      }
    }
  });

  it('lists every problem with its seq, then problems of the whole export', () => {
    const original = sampleExport();
    const tampered = {
      ...original,
      transactions: original.transactions.map((t) =>
        t.seq === 4 ? { ...t, descriptionEn: 'changed' } : t,
      ),
      balances: { ...original.balances, 'cash:provider': 0 },
    };
    const { out } = run([fileWith(tampered)]);
    expect(out).toMatch(
      /^PROBLEMS \(2\)\nseq 4 {2}HASH_MISMATCH {2}stored hash does not match the content\n- {6}BALANCE_MISMATCH/,
    );
  });

  it('reports usage, unreadable files and invalid JSON with exit code 2', () => {
    expect(run([]).code).toBe(2);
    expect(run([]).err).toContain('Usage: verify-ledger <export.json>');
    expect(run([join(dir, 'missing.json')]).code).toBe(2);
    const bad = run([fileWith('{ not json', 'bad.json')]);
    expect(bad.code).toBe(2);
    expect(bad.err).toContain('not valid JSON');
  });

  it('refuses a JSON file that is not a ledger export', () => {
    const { code, out } = run([fileWith({ hello: 'world' })]);
    expect(code).toBe(1);
    expect(out).toContain('MALFORMED_EXPORT');
  });

  it('formats a report without the problem list when everything is OK', () => {
    expect(formatReport({ ok: true, problems: [], summary: null })).toBe('OK\n');
  });
});
