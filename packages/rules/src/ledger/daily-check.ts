// The daily check (spec 2.9 `reconciliation`, 2.5 invariant 6, R5.5, D16.2) over every group of one
// provider account, so the service only loads the ledgers and the provider balance: every sum is
// made here.

import { scheduleFee, type FeeSchedule } from '../fees';
import { assertNonNegativeFcfa, sumFcfa, type Fcfa } from '../money';
import { parseAccount } from './accounts';
import { computeBalancesSkippingUnsafe, summarizeBalances } from './balances';
import { coverageGaps, type CoverageGap } from './coverage';
import { reservedShortfall } from './derived';
import { checkLedger } from './invariants';
import { reconcile, type ReconciliationStatus } from './reconciliation';
import type { LedgerTransaction } from './types';
import type { LedgerProblem } from './validation';

/**
 * L5, owner Q5 (2026-11-14): the reconciliation tolerance for one group, the sum of the estimated
 * fees of its disbursements still in flight. Documented convention: a fee up to twice its estimate
 * is still a WARNING; beyond, an ALERT (a configurable cap may come later).
 */
export function inFlightFeeTolerance(transactions: readonly LedgerTransaction[]): Fcfa {
  const fees = new Map<string, Fcfa>();
  const open = new Map<string, number>();
  for (const tx of transactions) {
    for (const p of tx.postings ?? []) {
      const parsed = parseAccount(p?.account ?? '');
      if (parsed?.kind !== 'IN_FLIGHT' || !Number.isSafeInteger(p.amount)) continue;
      open.set(parsed.id!, (open.get(parsed.id!) ?? 0) + p.amount);
      const fee = tx.metadata?.feeEstimated;
      if (tx.type === 'DISBURSEMENT_SENT' && typeof fee === 'number' && Number.isSafeInteger(fee))
        fees.set(parsed.id!, fee);
    }
  }
  return sumFcfa([...open].filter(([, raw]) => raw !== 0).map(([id]) => fees.get(id) ?? 0));
}

/** One group's part of the daily check. */
export interface GroupCheck {
  groupId: string;
  /** checkLedger: integrity problems (none when sound). */
  problems: LedgerProblem[];
  /** D16.2, H1: by how much cash falls short of reserved money now (0 when covered). */
  reservedShortfall: Fcfa;
  /** D16.2: the periods reserved money was not covered (for the run details). */
  coverageGaps: CoverageGap[];
}

/**
 * Spec 2.9, 2.5 invariant 6, R5.5: the daily check of one provider account. Each group's ledger is
 * checked (checkLedger) and summarised; cash and money in flight are added up across the groups and
 * compared with the provider's balance (reconcile). `pendingCollections` are the amounts of the
 * collections requested and not yet recorded (PENDING or EXPIRED intents): the provider may already
 * hold them, net of their schedule fee. ALERT pauses withdrawals and every other disbursement.
 */
export function dailyReconciliation(input: {
  groups: readonly { groupId: string; transactions: readonly LedgerTransaction[] }[];
  providerBalance: Fcfa;
  pendingCollections: readonly Fcfa[];
  feeSchedule: FeeSchedule;
}): {
  status: ReconciliationStatus;
  difference: number;
  withdrawalsPaused: boolean;
  ledgerCash: number;
  inFlightDisbursements: Fcfa;
  inFlightCollections: Fcfa;
  inFlightFeeTolerance: Fcfa;
  reservedShortfall: Fcfa;
  groups: GroupCheck[];
} {
  const groups: GroupCheck[] = [];
  const cash: number[] = [];
  const inFlight: number[] = [];
  const tolerance: number[] = [];
  for (const group of input.groups) {
    const { balances } = computeBalancesSkippingUnsafe(group.transactions);
    const summary = summarizeBalances(balances);
    cash.push(summary.cash);
    inFlight.push(summary.inFlight);
    tolerance.push(inFlightFeeTolerance(group.transactions));
    groups.push({
      groupId: group.groupId,
      problems: checkLedger(group.groupId, group.transactions),
      reservedShortfall: reservedShortfall(summary),
      coverageGaps: coverageGaps(group.transactions),
    });
  }
  const collections = input.pendingCollections.map((amount) => {
    assertNonNegativeFcfa(amount, 'pending collection');
    return Math.max(0, amount - scheduleFee(input.feeSchedule, 'COLLECTION', amount));
  });
  const totals = {
    ledgerCash: sumFcfa(cash),
    inFlightDisbursements: sumFcfa(inFlight),
    inFlightCollections: sumFcfa(collections),
    inFlightFeeTolerance: sumFcfa(tolerance),
    reservedShortfall: sumFcfa(groups.map((g) => g.reservedShortfall)),
  };
  const result = reconcile({
    ...totals,
    providerBalance: input.providerBalance,
    ledgerProblemCount: groups.reduce((n, g) => n + g.problems.length, 0),
  });
  return { ...result, ...totals, groups };
}
