// verify-ledger: reads a ledger export (spec 2.14), recomputes the hash chain, balances and
// invariants with @njangi/rules, and prints OK or the list of problems with their exact seq.

import { readFileSync } from 'node:fs';
import { verifyLedgerExport, type ExportVerification } from '@njangi/rules';

export interface Output {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

const USAGE = 'Usage: verify-ledger <export.json>   (use - to read from standard input)\n';

/** Spec 2.14: "OK" with a short summary, or "PROBLEMS (n)" and one line per problem. */
export function formatReport(result: ExportVerification): string {
  if (result.ok) {
    const s = result.summary;
    if (!s) return 'OK\n';
    return [
      'OK',
      `${s.transactions} transactions, head seq ${s.headSeq ?? '-'} ${s.headHash ? s.headHash.slice(0, 12) : ''}`.trimEnd(),
      `balances (FCFA): cash:provider ${s.cash}, fund:general ${s.generalFund}, fund:solidarity ${s.solidarityFund}, ` +
        `payables ${s.payables}, receivables ${s.receivables}, pots ${s.pots}`,
      '',
    ].join('\n');
  }
  const labels = result.problems.map((p) => (p.seq === null ? '-' : `seq ${p.seq}`));
  const width = Math.max(...labels.map((l) => l.length)) + 2;
  const lines = result.problems.map((p, i) => `${labels[i]!.padEnd(width)}${p.code}  ${p.detail}`);
  return [`PROBLEMS (${result.problems.length})`, ...lines, ''].join('\n');
}

/**
 * Runs the tool. Exit codes: 0 the export is intact, 1 problems were found, 2 the file could not be
 * read or is not JSON.
 */
export function runVerify(args: readonly string[], out: Output, readStdin?: () => string): number {
  const path = args[0];
  if (!path || args.length > 1) {
    out.stderr(USAGE);
    return 2;
  }
  let text: string;
  try {
    text = path === '-' && readStdin ? readStdin() : readFileSync(path, 'utf8');
  } catch (error) {
    out.stderr(`Cannot read ${path}: ${(error as Error).message}\n`);
    return 2;
  }
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    out.stderr(`${path} is not valid JSON.\n`);
    return 2;
  }
  const result = verifyLedgerExport(data);
  out.stdout(formatReport(result));
  return result.ok ? 0 : 1;
}
