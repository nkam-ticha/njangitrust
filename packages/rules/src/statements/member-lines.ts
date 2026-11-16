// Member statement lines (spec 2.14, FSD STA-01): what one member's statement lists, derived from
// the group's ledger (the source of truth for money, 2.5) and the member's obligations (for the
// round and the on-time flag, R3.5). Pure: no clock, no I/O, integer FCFA only.
//
// What each ledger entry means for a member M:
//   PAYMENT_RECEIVED  M paid it: contribution, shortfall and solidarity parts (gross amounts);
//                     M is credited by it: a payout line, net of the part's collection fee (R4.2);
//                     a correction debt's `feeCharged` is a fee M bore (D22.2).
//   POT_ASSIGNED, FUND_DISTRIBUTION, LEAVER_REFUND   credits to M's payable are payouts (D10, R9.3, R12.3).
//   WITHDRAWAL_COMPLETED   what reached M's phone, and the estimated fee M bore (R5.4, R4.3).
//   LOAN_DISBURSED         the principal and its interest; the estimated fee is added to the debt (R7.5).
//   SOLIDARITY_DISBURSED   what reached M's phone (R10.3).
//   FINE_ASSESSED, BID_ASSESSED   debts added to M (R6, R8).
//   REVERSAL, DISBURSEMENT_REFUNDED   undo the lines of the entry they point at; a REVERSAL of a
//                     REVERSAL applies the first entry again, as positive lines. A refunded loan also
//                     takes back the installments already repaid (`paidBack`, credited to M's payable).
//   POT_CORRECTION    lowers the pot M won (D15); CLAWBACK from a payable (D16.1): what M no longer
//                     held stays with M as an advance M now owes. In both, the part that becomes M's
//                     debt is shown as a CLAWBACK line, so the payouts total is what M really received.
//   CLAWBACK from the solidarity fund (D18.3) and CLAWBACK_RELEASE: what left M's payable for the
//                     fund, and what came back to it.
// Loan installments M paid or had settled come from the obligations (R7.3).

import { sumFcfa, type Fcfa } from '../money';
import { assertDate } from '../time';
import { payableAccount, receivableAccount, CASH_PROVIDER } from '../ledger/accounts';
import type { PaymentPartRecord } from '../ledger/fee-postings';
import type { LedgerTransaction } from '../ledger/types';
import {
  STATEMENT_CATEGORIES,
  type ObligationFact,
  type StatementLine,
  type StatementPeriod,
} from './types';

type Meta = Readonly<Record<string, unknown>>;

/** A recorded amount: whole francs or a RangeError (a forged export must not produce a statement). */
function whole(value: unknown, label: string): Fcfa {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new RangeError(`${label} is not a whole number of francs`);
  }
  return value;
}

const metaOf = (tx: LedgerTransaction): Meta => tx.metadata ?? {};

function line(
  tx: LedgerTransaction,
  fields: Pick<StatementLine, 'category' | 'kind' | 'amount'> & Partial<StatementLine>,
): StatementLine {
  return {
    at: tx.occurredAt,
    seq: tx.seq,
    roundNumber: null,
    onTime: null,
    feeShare: 0,
    interest: 0,
    reversal: false,
    ...fields,
  };
}

/** The same line undone by `tx`; undoing an undone line makes it a plain line again. */
const negated = (l: StatementLine, tx: LedgerTransaction): StatementLine => ({
  ...l,
  at: tx.occurredAt,
  seq: tx.seq,
  amount: 0 - l.amount,
  feeShare: 0 - l.feeShare,
  interest: 0 - l.interest,
  reversal: !l.reversal,
});

/** The amount that reached the recipient: cash out minus the actual fee (R4.3). */
function reachedRecipient(tx: LedgerTransaction): Fcfa {
  const cash = tx.postings.find((p) => p.account === CASH_PROVIDER);
  if (!cash || cash.amount >= 0) throw new RangeError(`seq ${tx.seq} has no cash payout`);
  return 0 - cash.amount - whole(metaOf(tx).feeActual, 'feeActual');
}

interface Index {
  byId: Map<string, LedgerTransaction>;
  bySeq: Map<number, LedgerTransaction>;
  /** DISBURSEMENT_SENT by its in-flight account, to find a loan's interest (D18.1). */
  sentByAccount: Map<string, LedgerTransaction>;
  facts: Map<string, ObligationFact>;
}

function indexOf(
  transactions: readonly LedgerTransaction[],
  obligations: readonly ObligationFact[],
): Index {
  const index: Index = {
    byId: new Map(),
    bySeq: new Map(),
    sentByAccount: new Map(),
    facts: new Map(obligations.map((o) => [o.id, o])),
  };
  for (const tx of transactions) {
    index.byId.set(tx.id, tx);
    index.bySeq.set(tx.seq, tx);
    if (tx.type !== 'DISBURSEMENT_SENT') continue;
    for (const p of tx.postings) {
      if (p.account.startsWith('inflight:disbursement:')) index.sentByAccount.set(p.account, tx);
    }
  }
  return index;
}

function paymentLines(tx: LedgerTransaction, m: string, index: Index): StatementLine[] {
  const parts = (metaOf(tx).parts ?? []) as PaymentPartRecord[];
  const out: StatementLine[] = [];
  for (const part of parts) {
    const amount = whole(part.amount, 'part amount');
    const feeShare = whole(part.feeShare, 'part feeShare');
    const fact = part.obligationId ? index.facts.get(part.obligationId) : undefined;
    if (tx.membershipId === m) {
      if (part.kind === 'CONTRIBUTION' || part.kind === 'SHORTFALL') {
        out.push(
          line(tx, {
            category: 'contributions',
            kind: part.kind,
            amount,
            roundNumber: fact?.roundNumber ?? null,
            onTime: fact?.onTime ?? null,
          }),
        );
      } else if (part.kind === 'SOLIDARITY') {
        out.push(
          line(tx, {
            category: 'solidarityContributions',
            kind: 'SOLIDARITY',
            amount,
            roundNumber: fact?.roundNumber ?? null,
            onTime: fact?.onTime ?? null,
          }),
        );
      } else if (part.feeCharged) {
        out.push(
          line(tx, {
            category: 'fees',
            kind: 'CORRECTION_FEE',
            amount: whole(part.feeCharged, 'feeCharged'),
          }),
        );
      }
    }
    if (
      (part.kind === 'CONTRIBUTION' || part.kind === 'SHORTFALL') &&
      part.account === payableAccount(m)
    ) {
      out.push(
        line(tx, {
          category: 'payouts',
          kind: part.kind === 'CONTRIBUTION' ? 'ROUND_PAYOUT' : 'SHORTFALL_REFUND',
          amount: amount - feeShare,
          roundNumber: fact?.roundNumber ?? null,
          feeShare,
        }),
      );
    }
  }
  return out;
}

/** Credits to M's payable by an entry that pays money out of a fund (no payment parts). */
function payableCredits(tx: LedgerTransaction, m: string): Fcfa {
  return sumFcfa(
    tx.postings
      .filter((p) => p.account === payableAccount(m) && p.amount < 0)
      .map((p) => 0 - p.amount),
  );
}

function ownLines(tx: LedgerTransaction, m: string, index: Index): StatementLine[] {
  switch (tx.type) {
    case 'PAYMENT_RECEIVED':
      return paymentLines(tx, m, index);
    case 'POT_ASSIGNED':
    case 'FUND_DISTRIBUTION':
    case 'LEAVER_REFUND': {
      const amount = payableCredits(tx, m);
      if (amount === 0) return [];
      const kind =
        tx.type === 'POT_ASSIGNED' ? 'POT' : tx.type === 'LEAVER_REFUND' ? 'REFUND' : 'FUND_SHARE';
      return [line(tx, { category: 'payouts', kind, amount })];
    }
    case 'WITHDRAWAL_COMPLETED': {
      if (tx.membershipId !== m) return [];
      return [
        line(tx, { category: 'withdrawals', kind: 'WITHDRAWAL', amount: reachedRecipient(tx) }),
        line(tx, {
          category: 'fees',
          kind: 'WITHDRAWAL_FEE',
          amount: whole(metaOf(tx).feeEstimated, 'feeEstimated'),
        }),
      ];
    }
    case 'LOAN_DISBURSED': {
      if (tx.membershipId !== m) return [];
      const inFlight = tx.postings.find((p) => p.account.startsWith('inflight:disbursement:'));
      const sent = inFlight ? index.sentByAccount.get(inFlight.account) : undefined;
      return [
        line(tx, {
          category: 'loans',
          kind: 'LOAN',
          amount: reachedRecipient(tx),
          interest: whole(sent ? metaOf(sent).interest : 0, 'interest'),
        }),
        line(tx, {
          category: 'fees',
          kind: 'LOAN_FEE',
          amount: whole(metaOf(tx).feeEstimated, 'feeEstimated'),
        }),
      ];
    }
    case 'SOLIDARITY_DISBURSED':
      return tx.membershipId === m
        ? [
            line(tx, {
              category: 'supportReceived',
              kind: 'SOLIDARITY_PAYOUT',
              amount: reachedRecipient(tx),
            }),
          ]
        : [];
    case 'FINE_ASSESSED':
    case 'BID_ASSESSED': {
      const debt = tx.postings.find((p) => p.account === receivableAccount(m) && p.amount > 0);
      if (!debt) return [];
      return [
        line(tx, {
          category: tx.type === 'FINE_ASSESSED' ? 'fines' : 'bids',
          kind: tx.type === 'FINE_ASSESSED' ? 'FINE' : 'BID',
          amount: debt.amount,
        }),
      ];
    }
    case 'POT_CORRECTION': {
      // D15: the pot loses the whole correction; the part M's payable no longer held is M's debt.
      const debt = receivableDebits(tx, m);
      if (payableDebits(tx, m) + debt === 0) return [];
      const back = sumFcfa(
        tx.postings
          .filter((p) => p.account.startsWith('pot:') && p.amount < 0)
          .map((p) => 0 - p.amount),
      );
      const out = [
        line(tx, { category: 'payouts', kind: 'POT', amount: 0 - back, reversal: true }),
      ];
      if (debt > 0) out.push(line(tx, { category: 'payouts', kind: 'CLAWBACK', amount: debt }));
      return out;
    }
    case 'CLAWBACK': {
      // D16.1: the payable is refilled by what M owes, just before the reversal empties it.
      const advance = payableCredits(tx, m);
      // D18.3: what the solidarity fund takes back from M's payable.
      const taken = payableDebits(tx, m);
      const out: StatementLine[] = [];
      if (advance > 0) {
        out.push(line(tx, { category: 'payouts', kind: 'CLAWBACK', amount: advance }));
      }
      if (taken > 0) {
        out.push(
          line(tx, {
            category: 'supportReceived',
            kind: 'CLAWBACK',
            amount: 0 - taken,
            reversal: true,
          }),
        );
      }
      return out;
    }
    case 'CLAWBACK_RELEASE': {
      const back = payableCredits(tx, m);
      return back > 0
        ? [line(tx, { category: 'supportReceived', kind: 'CLAWBACK_RELEASE', amount: back })]
        : [];
    }
    default:
      return [];
  }
}

/**
 * Owner Q2: a refunded loan credits the installments already repaid back to the borrower's payable.
 * The statement shows it as repayments taken back, so repayments net of it are what M still paid.
 */
function refundExtras(
  tx: LedgerTransaction,
  original: LedgerTransaction,
  m: string,
): StatementLine[] {
  if (tx.type !== 'DISBURSEMENT_REFUNDED' || original.type !== 'LOAN_DISBURSED') return [];
  if (original.membershipId !== m) return [];
  const paidBack = whole(metaOf(tx).paidBack ?? 0, 'paidBack');
  if (paidBack === 0) return [];
  return [
    line(tx, {
      category: 'repayments',
      kind: 'INSTALLMENT_REFUND',
      amount: 0 - paidBack,
      reversal: true,
    }),
  ];
}

/** Guards against a forged chain of entries that undo each other without end. */
const MAX_UNDO_DEPTH = 16;

/**
 * The lines an entry gives M: its own, or, when it undoes an earlier entry, that entry's lines
 * negated (so undoing a REVERSAL shows the first entry's lines again).
 */
function effectLines(tx: LedgerTransaction, m: string, index: Index, depth = 0): StatementLine[] {
  const original = undoneBy(tx, index);
  if (!original || original.seq >= tx.seq) return ownLines(tx, m, index);
  if (depth >= MAX_UNDO_DEPTH) throw new RangeError(`seq ${tx.seq} undoes too long a chain`);
  return [
    ...effectLines(original, m, index, depth + 1).map((l) => negated(l, tx)),
    ...refundExtras(tx, original, m),
  ];
}

/** What an entry takes out of M's payable. */
function payableDebits(tx: LedgerTransaction, m: string): Fcfa {
  return sumFcfa(
    tx.postings.filter((p) => p.account === payableAccount(m) && p.amount > 0).map((p) => p.amount),
  );
}

/** What an entry adds to M's debt. */
function receivableDebits(tx: LedgerTransaction, m: string): Fcfa {
  return sumFcfa(
    tx.postings
      .filter((p) => p.account === receivableAccount(m) && p.amount > 0)
      .map((p) => p.amount),
  );
}

/** The entry a REVERSAL or a refunded disbursement undoes, or undefined. */
function undoneBy(tx: LedgerTransaction, index: Index): LedgerTransaction | undefined {
  if (tx.type === 'REVERSAL') {
    const meta = metaOf(tx);
    return (
      (tx.refId ? index.byId.get(tx.refId) : undefined) ?? index.bySeq.get(Number(meta.reversesSeq))
    );
  }
  if (tx.type === 'DISBURSEMENT_REFUNDED') return index.bySeq.get(Number(metaOf(tx).completedSeq));
  return undefined;
}

function inPeriod(at: string, period: StatementPeriod): boolean {
  const t = Date.parse(at);
  return t >= Date.parse(period.start) && t < Date.parse(period.end);
}

function repaymentLines(obligations: readonly ObligationFact[], m: string): StatementLine[] {
  return obligations
    .filter(
      (o) =>
        o.membershipId === m &&
        o.kind === 'LOAN_INSTALLMENT' &&
        o.paidAt &&
        (o.status === 'PAID' || o.status === 'SETTLED'),
    )
    .map((o) => ({
      category: 'repayments' as const,
      kind: 'INSTALLMENT' as const,
      at: o.paidAt!,
      seq: null,
      amount: whole(o.amount, 'installment'),
      roundNumber: o.roundNumber,
      onTime: o.onTime,
      feeShare: 0,
      interest: 0,
      reversal: false,
    }));
}

const CATEGORY_ORDER = new Map<string, number>(STATEMENT_CATEGORIES.map((c, i) => [c, i]));

/**
 * 2.14: the lines of member `membershipId` whose time falls in `period` (start included, end
 * excluded), oldest first. `transactions` is the group's whole chain, because a reversal points
 * back to an earlier entry; `obligations` are the member's own.
 */
export function memberStatementLines(input: {
  membershipId: string;
  transactions: readonly LedgerTransaction[];
  obligations: readonly ObligationFact[];
  period: StatementPeriod;
}): StatementLine[] {
  assertDate(new Date(input.period.start), 'period.start');
  assertDate(new Date(input.period.end), 'period.end');
  const index = indexOf(input.transactions, input.obligations);
  const lines: StatementLine[] = [];
  for (const tx of input.transactions) {
    lines.push(...effectLines(tx, input.membershipId, index));
  }
  lines.push(...repaymentLines(input.obligations, input.membershipId));
  return lines
    .filter((l) => inPeriod(l.at, input.period))
    .sort(
      (a, b) =>
        Date.parse(a.at) - Date.parse(b.at) ||
        (a.seq ?? Number.MAX_SAFE_INTEGER) - (b.seq ?? Number.MAX_SAFE_INTEGER) ||
        (CATEGORY_ORDER.get(a.category) ?? 0) - (CATEGORY_ORDER.get(b.category) ?? 0),
    );
}
