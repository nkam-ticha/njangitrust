// Test helpers for building ledgers quickly. Not part of the package's public API.

import {
  completionType,
  disbursementCompletedPostings,
  disbursementRefundedPostings,
  loanSentPostings,
  solidaritySentPostings,
  withdrawalSentPostings,
} from './disbursement-postings';
import { paymentReceivedPostings } from './fee-postings';
import { computeTransactionHash, genesisHash, sealTransaction, sortPostings } from './hash-chain';
import type { LedgerEntry, LedgerTransaction, Posting, TransactionType } from './types';

export const TEST_GROUP = '9b2e0c4e-1111-4a5b-8c9d-000000000001';

let counter = 0;

/** A valid entry of the given type and postings; any field can be overridden. */
export function entry(
  type: TransactionType,
  lines: Posting[] | { postings: Posting[]; metadata: object },
  overrides: Partial<LedgerEntry> = {},
): LedgerEntry {
  const { postings, metadata } = Array.isArray(lines) ? { postings: lines, metadata: {} } : lines;
  counter += 1;
  // L1, L3: the payer of a debt payment, the member a disbursement or a correction concerns.
  const own = postings.find((p) =>
    type === 'PAYMENT_RECEIVED'
      ? p.account.startsWith('receivable:member:')
      : ['DISBURSEMENT_SENT', 'DISBURSEMENT_REFUNDED', 'CLAWBACK', 'POT_CORRECTION'].includes(
          type,
        ) &&
        (p.account.startsWith('payable:member:') || p.account.startsWith('receivable:member:')),
  );
  // L3 (audit 4): every payment names its payer; tests that don't care get PAYER.
  const fallback = type === 'PAYMENT_RECEIVED' ? 'PAYER' : null;
  return {
    id: `tx-${counter}`,
    type,
    occurredAt: new Date(Date.UTC(2026, 10, 1) + counter * 60_000).toISOString(),
    roundId: null,
    membershipId: own ? own.account.split(':')[2]! : fallback,
    refType: null,
    refId: null,
    descriptionFr: `Écriture ${counter}`,
    descriptionEn: `Entry ${counter}`,
    metadata: metadata as LedgerEntry['metadata'],
    postings,
    ...overrides,
  };
}

/** Seals entries one after the other into a chain for `groupId`. */
export function chainOf(entries: LedgerEntry[], groupId = TEST_GROUP): LedgerTransaction[] {
  const out: LedgerTransaction[] = [];
  for (const e of entries)
    out.push(sealTransaction({ groupId, previous: out.at(-1) ?? null, entry: e }));
  return out;
}

/** Like chainOf, but seals entries a forger wrote without the checks of sealTransaction. */
export function forgedChainOf(entries: LedgerEntry[], groupId = TEST_GROUP): LedgerTransaction[] {
  const out: LedgerTransaction[] = [];
  for (const e of entries) {
    const previous = out.at(-1);
    const unsealed = {
      ...e,
      postings: sortPostings(e.postings),
      groupId,
      seq: previous ? previous.seq + 1 : 1,
      prevHash: previous ? previous.hash : genesisHash(groupId),
    };
    out.push({ ...unsealed, hash: computeTransactionHash(unsealed) });
  }
  return out;
}

/** A fine on member SEED and its payment (no fee): gives a test group's general fund cash to lend. */
export function seedFund(amount: number): LedgerEntry[] {
  return [
    entry('FINE_ASSESSED', [
      { account: 'receivable:member:SEED', amount },
      { account: 'fund:general', amount: -amount },
    ]),
    entry(
      'PAYMENT_RECEIVED',
      paymentReceivedPostings({
        payerMembershipId: 'SEED',
        fee: 0,
        feeSource: 'PROVIDER',
        parts: [{ kind: 'DEBT', amount, ref: 'seed' }],
      }),
    ),
  ];
}

type Fees = { feeActual?: number; feeEstimated?: number; id?: string };
let ops = 0;

/** D18.1: the send of a disbursement; complete it with completeOf. */
export function sendOf(
  purpose: 'WITHDRAWAL' | 'LOAN' | 'SOLIDARITY',
  member: string,
  amount: number,
  options: Fees & { interest?: number } = {},
): LedgerEntry {
  ops += 1;
  const operationId = options.id ?? `op${ops}`;
  const feeEstimated = options.feeEstimated ?? 500;
  const lines =
    purpose === 'WITHDRAWAL'
      ? withdrawalSentPostings({ operationId, membershipId: member, amount, feeEstimated })
      : purpose === 'LOAN'
        ? loanSentPostings({
            operationId,
            membershipId: member,
            principal: amount,
            interest: options.interest ?? 0,
            feeEstimated,
          })
        : solidaritySentPostings({ operationId, amount, feeEstimated });
  return entry('DISBURSEMENT_SENT', lines, { membershipId: member });
}

/** D18.1: the completion of a send, at the given actual fee (the estimate by default). */
export function completeOf(sent: LedgerEntry, feeActual?: number): LedgerEntry {
  const m = sent.metadata as { purpose: 'WITHDRAWAL'; amount: number; feeEstimated: number };
  const account = sent.postings.find((p) => p.account.startsWith('inflight:'))!.account;
  return entry(
    completionType(m.purpose),
    disbursementCompletedPostings({
      operationId: account.split(':')[2]!,
      amount: m.amount,
      feeEstimated: m.feeEstimated,
      feeActual: feeActual ?? m.feeEstimated,
      feeSource: 'PROVIDER',
    }),
    { membershipId: sent.membershipId },
  );
}

/** D18.1: a disbursement sent and completed: [send, completion]. */
export function paidOut(
  purpose: 'WITHDRAWAL' | 'LOAN' | 'SOLIDARITY',
  member: string,
  amount: number,
  options: Fees & { interest?: number } = {},
): LedgerEntry[] {
  const sent = sendOf(purpose, member, amount, options);
  return [sent, completeOf(sent, options.feeActual)];
}

/** D22.1: the operator reversed a completed disbursement; `feeKept` is the fee it keeps. */
export function refundOf(
  sent: LedgerEntry,
  completed: LedgerEntry,
  completedSeq: number,
  feeKept = 0,
): LedgerEntry {
  return entry(
    'DISBURSEMENT_REFUNDED',
    disbursementRefundedPostings({ sent, completed, completedSeq, feeKept }),
    { membershipId: sent.membershipId },
  );
}
