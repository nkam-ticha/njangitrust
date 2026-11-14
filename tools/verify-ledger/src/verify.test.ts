import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeBalances, computeTransactionHash } from '@njangi/rules';
import {
  correctionsExport,
  lendingExport,
  refundExport,
  sampleExport,
} from './sample-export.test-support';
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
    expect(out).toContain('8 transactions, head seq 8');
    expect(out).toContain('cash:provider 3964'); // 4 × 10 900 − (39 136 + 500)
    expect(out).toContain('in flight 0');
    expect(out).not.toContain('WARNING');
  });

  it('accepts corrections and money in flight, and warns (exit 0) while reserved money is uncovered (H1, L6)', () => {
    const file = correctionsExport();
    expect(file.transactions.map((t) => t.type).slice(-3)).toEqual([
      'DISBURSEMENT_SENT',
      'CLAWBACK',
      'REVERSAL',
    ]);
    const { code, out } = run([fileWith(file)]);
    expect(code).toBe(0);
    expect(out.split('\n')[0]).toBe('OK');
    expect(out).toContain('receivables 5273, pots 0, in flight 3500'); // M3's fine 1 000 + clawback 4 273
    expect(out).toMatch(/WARNING {2}RESERVED_NOT_COVERED {2}uncovered now: 4273/);
  });

  it('accepts a completed payout refunded by the operator (D22.1)', () => {
    const { code, out } = run([fileWith(refundExport())]);
    expect(code).toBe(0);
    expect(out.split('\n')[0]).toBe('OK');
    expect(out).toContain('cash:provider 43600'); // 4 × 10 900: the payout came back with its fee
    expect(out).not.toContain('WARNING');
  });

  it('reports a loan of reserved money at its seq (RESERVED_LENT, audit 4 H1)', () => {
    const { code, out } = run([fileWith(lendingExport())]);
    expect(code).toBe(1);
    expect(out).toMatch(
      /seq 9 +RESERVED_LENT +the loan sent .* gives 1500 while only 0 is available/,
    );
  });

  it('still reports a forged correction at its seq', () => {
    const file = correctionsExport();
    const forged = file.transactions.map((t) => ({ ...t }));
    const i = forged.findIndex((t) => t.type === 'CLAWBACK');
    forged[i] = {
      ...forged[i]!,
      postings: forged[i]!.postings.map((p) => ({ ...p, amount: p.amount > 0 ? 9_909 : -9_909 })),
    };
    for (let k = i; k < forged.length; k++) {
      const t = forged[k]!;
      t.prevHash = k === 0 ? t.prevHash : forged[k - 1]!.hash;
      const { hash: _old, ...rest } = t;
      t.hash = computeTransactionHash(rest);
    }
    const last = forged.at(-1)!;
    const { code, out } = run([
      fileWith({
        ...file,
        transactions: forged,
        head: { seq: last.seq, hash: last.hash },
        balances: Object.fromEntries(computeBalances(forged)),
      }),
    ]);
    expect(code).toBe(1);
    expect(out).toMatch(
      new RegExp(`seq ${forged[i].seq} +CORRECTION_MISMATCH +the clawback should be 4273`),
    );
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

  it('recomputes the R4.2 fee split even when a forger re-hashed the chain', () => {
    const original = sampleExport();
    const forged = original.transactions.map((t) => ({ ...t }));
    const tx = forged[2]!; // a PAYMENT_RECEIVED of 10 000 + 1 000 with fee 100: shares 91 and 9
    const meta = tx.metadata as { parts: { feeShare: number; account: string }[] };
    meta.parts = meta.parts.map((p, i) => ({ ...p, feeShare: i === 0 ? 90 : 10 }));
    tx.postings = tx.postings.map((p) =>
      p.account.startsWith('payable')
        ? { ...p, amount: -9_910 }
        : p.account === 'fund:solidarity'
          ? { ...p, amount: -990 }
          : p,
    );
    for (let i = 2; i < forged.length; i++) {
      const t = forged[i]!;
      t.prevHash = forged[i - 1]!.hash;
      const { hash: _old, ...rest } = t;
      t.hash = computeTransactionHash(rest);
    }
    const last = forged.at(-1)!;
    const { code, out } = run([
      fileWith({
        ...original,
        transactions: forged,
        head: { seq: last.seq, hash: last.hash },
        balances: Object.fromEntries(computeBalances(forged)),
      }),
    ]);
    expect(code).toBe(1);
    expect(out).toMatch(/seq 3 +FEE_MISMATCH +the recorded fee split does not follow R4.2/);
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
    expect(formatReport({ ok: true, problems: [], warnings: [], summary: null })).toBe('OK\n');
  });
});
