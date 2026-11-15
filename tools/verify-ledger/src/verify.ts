// verify-ledger: reads a ledger export (spec 2.14), recomputes the hash chain, balances and
// invariants with @njangi/rules, and prints OK or the list of problems with their exact seq.

import { readFileSync } from 'node:fs';
import { verifyLedgerExport, type ExportVerification } from '@njangi/rules';

export interface Output {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

const USAGE = 'Usage: verify-ledger <export.json>   (use - to read from standard input)\n';

/** H1: the ledger's current state (e.g. reserved money not covered now); never a failure. */
function warningLines(result: ExportVerification): string[] {
  return (result.warnings ?? []).map((w) => `WARNING  ${w.code}  ${w.detail}`);
}

/**
 * Spec 2.14: "OK" with a short summary, or "PROBLEMS (n)" and one line per problem; then one line per
 * warning about the ledger's current state.
 */
export function formatReport(result: ExportVerification): string {
  if (result.ok) {
    const s = result.summary;
    if (!s) return ['OK', ...warningLines(result), ''].join('\n');
    return [
      'OK',
      `${s.transactions} transactions, head seq ${s.headSeq ?? '-'} ${s.headHash ? s.headHash.slice(0, 12) : ''}`.trimEnd(),
      `balances (FCFA): cash:provider ${s.cash}, fund:general ${s.generalFund}, fund:solidarity ${s.solidarityFund}, ` +
        `payables ${s.payables}, receivables ${s.receivables}, pots ${s.pots}, in flight ${s.inFlight}`,
      ...warningLines(result),
      '',
    ].join('\n');
  }
  const labels = result.problems.map((p) => (p.seq === null ? '-' : `seq ${p.seq}`));
  const width = Math.max(...labels.map((l) => l.length)) + 2;
  const lines = result.problems.map((p, i) => `${labels[i]!.padEnd(width)}${p.code}  ${p.detail}`);
  return [`PROBLEMS (${result.problems.length})`, ...lines, ...warningLines(result), ''].join('\n');
}

/**
 * Runs the tool. Exit codes: 0 the export is intact (warnings about its current state included),
 * 1 problems were found, 2 the file could not be read, is not JSON, or could not be verified at all
 * (N5: an unexpected error never escapes as a crash). `verify` is replaceable for tests only.
 */
export function runVerify(
  args: readonly string[],
  out: Output,
  readStdin?: () => string,
  verify: (data: unknown) => ExportVerification = verifyLedgerExport,
): number {
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
    data = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text); // skip a UTF-8 BOM
  } catch {
    out.stderr(`${path} is not valid JSON.\n`);
    return 2;
  }
  let result: ExportVerification;
  try {
    result = verify(data);
  } catch (error) {
    out.stderr(`${path} could not be verified: ${(error as Error).message}\n`);
    return 2;
  }
  out.stdout(formatReport(result));
  return result.ok ? 0 : 1;
}
