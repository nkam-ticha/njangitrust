// Verification of an audit export (2.14, spec 5.2): the hash chain, balances and invariants are
// recomputed from the transactions alone. Used by tools/verify-ledger and by tests.

import { parseAccount } from './accounts';
import { computeBalances, summarizeBalances, type BalanceSummary } from './balances';
import { drawProblems, proposalProblems, unmaskedPhoneProblems } from './export-checks';
import { LEDGER_EXPORT_FORMAT, LEDGER_EXPORT_VERSION, type LedgerExport } from './export-format';
import { checkLedger } from './invariants';
import type { LedgerTransaction } from './types';
import type { LedgerProblem } from './validation';

export interface ExportSummary extends Pick<
  BalanceSummary,
  'cash' | 'generalFund' | 'solidarityFund' | 'payables' | 'receivables' | 'pots'
> {
  groupId: string;
  transactions: number;
  headSeq: number | null;
  headHash: string | null;
}

export interface ExportVerification {
  ok: boolean;
  /** Problems with a seq first, in ledger order; then problems of the export as a whole. */
  problems: LedgerProblem[];
  summary: ExportSummary | null;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

function shapeProblem(data: unknown): string | null {
  if (!isObject(data)) return 'the file is not a JSON object';
  if (data.format !== LEDGER_EXPORT_FORMAT || data.version !== LEDGER_EXPORT_VERSION) {
    return `not a ${LEDGER_EXPORT_FORMAT} version ${LEDGER_EXPORT_VERSION} file`;
  }
  if (!isObject(data.group) || typeof data.group.id !== 'string') return 'group.id is missing';
  if (!Array.isArray(data.transactions) || !data.transactions.every(isObject))
    return 'transactions must be a list';
  for (const key of ['members', 'ruleSets', 'cycles', 'proposals'] as const) {
    if (!Array.isArray(data[key])) return `${key} must be a list`;
  }
  if (!isObject(data.balances)) return 'balances must be an object';
  const head = data.head;
  if (
    head !== null &&
    !(isObject(head) && typeof head.seq === 'number' && typeof head.hash === 'string')
  ) {
    return 'head must be null or { seq, hash }';
  }
  return null;
}

function validPostings(transactions: readonly LedgerTransaction[]) {
  return transactions.map((tx) => ({
    postings: Array.isArray(tx.postings)
      ? tx.postings.filter((p) => parseAccount(p?.account ?? '') && Number.isSafeInteger(p.amount))
      : [],
  }));
}

function balanceProblems(
  claimed: Record<string, number>,
  actual: ReadonlyMap<string, number>,
): LedgerProblem[] {
  const accounts = new Set([...Object.keys(claimed), ...actual.keys()]);
  const problems: LedgerProblem[] = [];
  for (const account of [...accounts].sort()) {
    const said = claimed[account] ?? 0;
    const real = actual.get(account) ?? 0;
    if (said !== real) {
      problems.push({
        seq: null,
        code: 'BALANCE_MISMATCH',
        detail: `${account}: export says ${said}, postings give ${real}`,
      });
    }
  }
  return problems;
}

/**
 * 2.14, 5.2: verifies a ledger export. Recomputes the hash chain and every invariant transaction by
 * transaction (a change to any field of any stored transaction is reported at exactly its seq), the
 * head, the balances, the draws, the proposal tallies, and that no phone number appears unmasked.
 */
export function verifyLedgerExport(data: unknown): ExportVerification {
  const shape = shapeProblem(data);
  if (shape)
    return {
      ok: false,
      problems: [{ seq: null, code: 'MALFORMED_EXPORT', detail: shape }],
      summary: null,
    };
  const exp = data as LedgerExport;
  const groupId = exp.group.id;
  const txs = exp.transactions;

  const withSeq = [...checkLedger(groupId, txs), ...drawProblems(groupId, txs, exp.cycles)];
  const ordered = withSeq
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (a.p.seq ?? Infinity) - (b.p.seq ?? Infinity) || a.i - b.i)
    .map((x) => x.p);

  const general: LedgerProblem[] = [];
  const last = txs.at(-1);
  if (
    exp.head
      ? !last || last.seq !== exp.head.seq || last.hash !== exp.head.hash
      : last !== undefined
  ) {
    general.push({
      seq: exp.head?.seq ?? null,
      code: 'HEAD_MISMATCH',
      detail: 'the last transaction is not the recorded head (missing or extra entries)',
    });
  }
  const balances = computeBalances(validPostings(txs));
  general.push(...balanceProblems(exp.balances, balances));
  general.push(...proposalProblems(exp.proposals));
  general.push(...unmaskedPhoneProblems(exp));

  const problems = [...ordered, ...general];
  const summary = summarizeBalances(balances);
  return {
    ok: problems.length === 0,
    problems,
    summary: {
      groupId,
      transactions: txs.length,
      headSeq: last?.seq ?? null,
      headHash: last?.hash ?? null,
      cash: summary.cash,
      generalFund: summary.generalFund,
      solidarityFund: summary.solidarityFund,
      payables: summary.payables,
      receivables: summary.receivables,
      pots: summary.pots,
    },
  };
}
