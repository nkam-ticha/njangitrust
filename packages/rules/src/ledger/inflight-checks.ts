// In-flight disbursement checks (D18.1). Each in-flight account is opened by exactly one
// DISBURSEMENT_SENT and closed by exactly one completion of the same purpose and member, which moves
// the whole in-flight balance out to the provider, or by one DISBURSEMENT_RETURNED, the exact
// negation of the send. Nothing else may touch an in-flight account; an open one is a payout still
// in progress (not a problem). D22.1: a completed one may later be refunded once, exactly
// (DISBURSEMENT_REFUNDED, metadata.completedSeq).

import { canonicalJSON } from '../crypto';
import { parseAccount } from './accounts';
import {
  completionType,
  disbursementRefundedPostings,
  type DisbursementPurpose,
} from './disbursement-postings';
import { sortPostings } from './hash-chain';
import type { LedgerTransaction, Posting } from './types';
import type { LedgerProblem } from './validation';

/** D18.1: the transaction types that open, complete or return an in-flight account. */
export const IN_FLIGHT_TYPES: readonly string[] = [
  'DISBURSEMENT_SENT',
  'WITHDRAWAL_COMPLETED',
  'LOAN_DISBURSED',
  'SOLIDARITY_DISBURSED',
  'DISBURSEMENT_RETURNED',
];

/**
 * D18.1, D22.1: every entry of a disbursement's life. None is ever reversed, so no correction ever
 * prepares one (L4): a failure is returned, an operator reversal is refunded.
 */
export const DISBURSEMENT_TYPES: readonly string[] = [...IN_FLIGHT_TYPES, 'DISBURSEMENT_REFUNDED'];

interface Operation {
  sentSeq: number;
  purpose: DisbursementPurpose;
  membershipId: string | null;
  feeEstimated: number;
  postings: readonly Posting[];
  metadata: Readonly<Record<string, unknown>>;
  closedAt: number | null;
  /** D22.1: the completion, once the provider confirmed (null while in flight or when returned). */
  completion: { postings: readonly Posting[]; metadata: Readonly<Record<string, unknown>> } | null;
  refundedAt: number | null;
}

const inFlightIds = (postings: readonly Posting[]): string[] => [
  ...new Set(
    postings
      .map((p) => parseAccount(p.account))
      .filter((a) => a?.kind === 'IN_FLIGHT')
      .map((a) => a!.id!),
  ),
];

function negates(a: readonly Posting[], b: readonly Posting[]): boolean {
  const key = (p: Posting) => `${p.account}|${p.amount}`;
  const negated = a.map((p) => key({ account: p.account, amount: 0 - p.amount })).sort();
  const other = b.map(key).sort();
  return negated.length === other.length && negated.every((k, i) => k === other[i]);
}

/** Tracks every in-flight account; call `check` for each valid transaction. */
export function createInFlightTracker() {
  const operations = new Map<string, Operation>();
  /** The operation an entry (by seq) opened, so a return can name its send. */
  const bySentSeq = new Map<number, string>();
  /** D22.1: the operation a completion (by seq) closed, so a refund can name it. */
  const byCompletedSeq = new Map<number, string>();
  function refundIssue(tx: LedgerTransaction, seq: number): string | null {
    const id = byCompletedSeq.get(tx.metadata.completedSeq as number);
    const op = id === undefined ? undefined : operations.get(id);
    if (!op || !op.completion) return 'metadata.completedSeq must be the seq of a completion';
    if (op.refundedAt !== null)
      return `the disbursement was already refunded at seq ${op.refundedAt}`;
    if (tx.membershipId !== op.membershipId) return `${tx.type} must name the send's member`;
    let expected;
    try {
      expected = disbursementRefundedPostings({
        sent: op,
        completed: op.completion,
        completedSeq: tx.metadata.completedSeq as number,
        feeKept: tx.metadata.feeKept as number,
        paidBack: tx.metadata.paidBack as number | undefined,
      });
    } catch (error) {
      return (error as Error).message;
    }
    // Owner Q2: a loan refund records paidBack (0 included); no other refund does.
    if (canonicalJSON(expected.metadata) !== canonicalJSON(tx.metadata))
      return op.purpose === 'LOAN'
        ? 'a loan refund records paidBack, the installments already repaid'
        : 'only a loan refund records paidBack';
    const key = (ps: readonly Posting[]) =>
      sortPostings(ps)
        .map((p) => `${p.account}|${p.amount}`)
        .join(',');
    if (key(expected.postings) !== key(tx.postings))
      return 'the refund does not put back exactly what the send took, less the fee kept and the installments repaid';
    op.refundedAt = seq;
    return null;
  }
  return {
    /** D18.1: the open operation a payout belongs to, or undefined. */
    operation: (id: string): Readonly<Operation> | undefined => operations.get(id),
    /** `balances` are the raw balances before this transaction. */
    check(
      tx: LedgerTransaction,
      seq: number,
      balances: ReadonlyMap<string, number>,
    ): LedgerProblem[] {
      const ids = inFlightIds(tx.postings);
      const issue = (detail: string): LedgerProblem[] => [
        { seq, code: 'IN_FLIGHT_MISMATCH', detail },
      ];
      if (tx.type === 'DISBURSEMENT_REFUNDED') {
        if (ids.length > 0) return issue('a refund does not move money in flight');
        const refund = refundIssue(tx, seq);
        return refund ? issue(refund) : [];
      }
      if (!IN_FLIGHT_TYPES.includes(tx.type)) {
        return ids.length > 0 ? issue(`${tx.type} cannot move money in flight`) : [];
      }
      if (ids.length !== 1) return issue(`${tx.type} concerns exactly one in-flight account`);
      const id = ids[0]!;
      const account = `inflight:disbursement:${id}`;
      const op = operations.get(id);
      if (tx.type === 'DISBURSEMENT_SENT') {
        if (op) return issue(`${account} was already used at seq ${op.sentSeq}`);
        operations.set(id, {
          sentSeq: seq,
          purpose: tx.metadata.purpose as DisbursementPurpose,
          membershipId: tx.membershipId,
          feeEstimated: tx.metadata.feeEstimated as number,
          postings: tx.postings,
          metadata: tx.metadata,
          closedAt: null,
          completion: null,
          refundedAt: null,
        });
        bySentSeq.set(seq, id);
        return [];
      }
      if (!op) return issue(`${account} was never sent`);
      if (op.closedAt !== null) return issue(`${account} was already closed at seq ${op.closedAt}`);
      if (tx.membershipId !== op.membershipId)
        return issue(`${tx.type} must name the send's member`);
      if (tx.type === 'DISBURSEMENT_RETURNED') {
        if (bySentSeq.get(tx.metadata.sentSeq as number) !== id)
          return issue('metadata.sentSeq must be the seq of the send');
        if (!negates(op.postings, tx.postings))
          return issue(`the return is not the exact negation of seq ${op.sentSeq}`);
      } else {
        if (tx.type !== completionType(op.purpose))
          return issue(`a ${op.purpose} disbursement completes with ${completionType(op.purpose)}`);
        if (tx.metadata.feeEstimated !== op.feeEstimated)
          return issue('the estimated fee differs from the send');
        const held = 0 - (balances.get(account) ?? 0);
        const moved = tx.postings.find((p) => p.account === account)!.amount;
        if (moved !== held) return issue(`${account} holds ${held}, the completion moved ${moved}`);
        op.completion = { postings: tx.postings, metadata: tx.metadata };
        byCompletedSeq.set(seq, id);
      }
      op.closedAt = seq;
      return [];
    },
  };
}
