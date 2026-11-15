// Who owes a solidarity shortfall (D17.2 refined by D18.3). When a reversed payment's solidarity
// part has already been paid out of the fund, the missing amount is owed by the recipient of the most
// recent solidarity payout, never more than that payout; any rest by the previous recipient, and so on
// backwards; if no recipient remains, by the member whose payment was reversed. A payout the operator
// reversed after completion (DISBURSEMENT_REFUNDED, D22.1) is back in the fund: it no longer counts
// as received and is skipped. The planner (corrections.ts) and the checker (correction-checks.ts) share this history.
//
// Owner decisions Q1 and Q3 (2026-11-14): when a solidarity payout's money comes back to the fund
// (DISBURSEMENT_RETURNED of the send, or DISBURSEMENT_REFUNDED of the completion), it releases the
// solidarity clawbacks it made unnecessary (`releasesFor`, CLAWBACK_RELEASE). Had the money been in
// the fund, every correction block posted while it was out (after its send) would have needed less;
// the money returned, A, is the budget:
// 1. a refunded payout's recipient no longer received it: the clawbacks charged to that payout are
//    released first, in full;
// 2. then the other clawbacks posted after the send, oldest block first (A would have met the first
//    shortfall first) and, within a block, from the last debtor back (D18.3 allocates newest payout
//    first and the payer last, so the smaller shortfall would have spared the payer, then the oldest
//    recipients);
// each release is capped at what is left of its clawback; released money no longer counts as clawed
// from its payout. Only returned money triggers a release: new contributions never do.

import type { Fcfa } from '../money';
import { parseAccount, SOLIDARITY_FUND } from './accounts';
import type { Posting, TransactionType } from './types';

/** D18.3: one completed solidarity payout and how much of it has been clawed back so far. */
export interface SolidarityPayout {
  /** Seq of its SOLIDARITY_DISBURSED (completion). */
  seq: number;
  recipient: string;
  /** A: the payout the vote passed (the recipient bore its fee, R10.3). */
  amount: Fcfa;
  clawed: Fcfa;
  /** D22.1: the operator reversed it and the money went back to the fund. */
  refunded: boolean;
}

/** D18.3: one debtor's share of a solidarity shortfall. `payoutSeq` null means the payer. */
export interface SolidarityDebt {
  debtorMembershipId: string;
  amount: Fcfa;
  payoutSeq: number | null;
}

/** A solidarity CLAWBACK as recorded, with what has been released of it since (Q1, Q3). */
export interface SolidarityClawback {
  seq: number;
  debtorMembershipId: string;
  /** Null when the payer owes it. */
  payoutSeq: number | null;
  /** The payment its block prepared the REVERSAL of (metadata.forReversalOfSeq). */
  forReversalOfSeq: number;
  /** What the clawback put back in the fund. */
  amount: Fcfa;
  /** The part that became the debtor's receivable (the rest came from their payable). */
  debt: Fcfa;
  released: Fcfa;
  /** The part of `released` that cancelled the debt (receivable credits). */
  releasedDebt: Fcfa;
  reversed: boolean;
}

/** Q1, Q3: one release a solidarity return or refund requires, in order. */
export interface RequiredRelease {
  clawbackSeq: number;
  debtorMembershipId: string;
  amount: Fcfa;
  /** What is left of the clawback's debt before this release (receivable part not yet released). */
  debtLeft: Fcfa;
}

type Observed = {
  seq: number;
  type: TransactionType;
  membershipId: string | null;
  postings: readonly Posting[];
  metadata: Readonly<Record<string, unknown>>;
};

/** A solidarity send: its seq, the amount A it took from the fund, and its completion if any. */
interface SolidaritySend {
  sentSeq: number;
  amount: Fcfa;
  completedSeq: number | null;
}

const inFlightId = (postings: readonly Posting[]): string | undefined =>
  postings.map((p) => parseAccount(p.account)).find((a) => a?.kind === 'IN_FLIGHT')?.id ??
  undefined;

const fundLine = (postings: readonly Posting[]): number =>
  postings.find((p) => p.account === SOLIDARITY_FUND)?.amount ?? 0;

/** Builds the history transaction by transaction (`observe`), then answers `allocate`. */
export function createSolidarityHistory() {
  const payouts: SolidarityPayout[] = [];
  const clawbacks = new Map<number, SolidarityClawback>();
  /** Seq of the first solidarity clawback of each block (by forReversalOfSeq), for block order. */
  const blockStart = new Map<number, number>();
  const sends = new Map<string, SolidaritySend>();
  const sendBySeq = new Map<number, SolidaritySend>();
  const sendByCompletedSeq = new Map<number, SolidaritySend>();
  const find = (seq: number | null) => payouts.find((p) => p.seq === seq);
  return {
    observe(tx: Observed): void {
      if (tx.type === 'DISBURSEMENT_SENT' && tx.metadata.purpose === 'SOLIDARITY') {
        const id = inFlightId(tx.postings);
        const send = { sentSeq: tx.seq, amount: fundLine(tx.postings), completedSeq: null };
        if (id !== undefined && !sends.has(id)) {
          sends.set(id, send);
          sendBySeq.set(tx.seq, send);
        }
      }
      if (tx.type === 'SOLIDARITY_DISBURSED' && tx.membershipId) {
        const line = tx.postings.find((p) => parseAccount(p.account)?.kind === 'IN_FLIGHT');
        if (line && line.amount > 0)
          payouts.push({
            seq: tx.seq,
            recipient: tx.membershipId,
            amount: line.amount,
            clawed: 0,
            refunded: false,
          });
        const send = sends.get(inFlightId(tx.postings) ?? '');
        if (send && send.completedSeq === null) {
          send.completedSeq = tx.seq;
          sendByCompletedSeq.set(tx.seq, send);
        }
      }
      if (tx.type === 'DISBURSEMENT_REFUNDED') {
        const payout = find(tx.metadata.completedSeq as number);
        if (payout) payout.refunded = true;
      }
      if (tx.type === 'CLAWBACK') {
        const fund = fundLine(tx.postings);
        if (fund === 0) return;
        const payoutSeq = (tx.metadata.solidarityPayoutSeq as number | null | undefined) ?? null;
        const block = tx.metadata.forReversalOfSeq as number;
        if (!blockStart.has(block)) blockStart.set(block, tx.seq);
        const debt = tx.postings.find((p) => p.account.startsWith('receivable:'))?.amount ?? 0;
        clawbacks.set(tx.seq, {
          seq: tx.seq,
          debtorMembershipId: tx.membershipId ?? '',
          payoutSeq,
          forReversalOfSeq: block,
          amount: -fund,
          debt: Math.max(0, debt),
          released: 0,
          releasedDebt: 0,
          reversed: false,
        });
        const payout = find(payoutSeq);
        if (payout) payout.clawed += -fund;
      }
      if (tx.type === 'CLAWBACK_RELEASE') {
        const clawback = clawbacks.get(tx.metadata.clawbackSeq as number);
        if (!clawback) return;
        const amount = Math.max(0, fundLine(tx.postings));
        const fromDebt = -(
          tx.postings.find((p) => p.account.startsWith('receivable:'))?.amount ?? 0
        );
        clawback.released += amount;
        clawback.releasedDebt += Math.max(0, fromDebt);
        const payout = find(clawback.payoutSeq);
        if (payout) payout.clawed -= amount;
      }
      if (tx.type === 'REVERSAL') {
        // Disbursement entries are never reversed (D18.1); a reversed CLAWBACK frees its payout again.
        const clawback = clawbacks.get(tx.metadata.reversesSeq as number);
        if (!clawback) return;
        clawback.reversed = true;
        const payout = find(clawback.payoutSeq);
        if (payout) payout.clawed -= clawback.amount - clawback.released;
      }
    },
    /** D18.3: splits `shortfall` newest payout first, each capped at what is left of it, then the payer. */
    allocate(shortfall: Fcfa, payerMembershipId: string | null): SolidarityDebt[] {
      const out: SolidarityDebt[] = [];
      let rest = shortfall;
      for (let i = payouts.length - 1; i >= 0 && rest > 0; i--) {
        const p = payouts[i]!;
        const left = p.refunded ? 0 : p.amount - p.clawed;
        if (left <= 0) continue;
        const take = Math.min(rest, left);
        out.push({ debtorMembershipId: p.recipient, amount: take, payoutSeq: p.seq });
        rest -= take;
      }
      if (rest > 0) {
        if (!payerMembershipId) throw new RangeError('no recipient or payer can owe the shortfall');
        out.push({ debtorMembershipId: payerMembershipId, amount: rest, payoutSeq: null });
      }
      return out;
    },
    /**
     * Q1, Q3: the releases a DISBURSEMENT_RETURNED or DISBURSEMENT_REFUNDED requires, in order
     * (empty for other entries and for withdrawals or loans). Call before observing the releases.
     */
    releasesFor(tx: Pick<Observed, 'type' | 'metadata'>): RequiredRelease[] {
      let send: SolidaritySend | undefined;
      let ownPayout: number | null = null;
      if (tx.type === 'DISBURSEMENT_RETURNED') send = sendBySeq.get(tx.metadata.sentSeq as number);
      if (tx.type === 'DISBURSEMENT_REFUNDED') {
        send = sendByCompletedSeq.get(tx.metadata.completedSeq as number);
        ownPayout = send?.completedSeq ?? null;
      }
      if (!send) return [];
      const after = send.sentSeq;
      const open = [...clawbacks.values()].filter(
        (c) => !c.reversed && c.seq > after && c.amount - c.released > 0,
      );
      const own = open
        .filter((c) => ownPayout !== null && c.payoutSeq === ownPayout)
        .sort((a, b) => a.seq - b.seq);
      const others = open
        .filter((c) => !own.includes(c))
        .sort(
          (a, b) =>
            blockStart.get(a.forReversalOfSeq)! - blockStart.get(b.forReversalOfSeq)! ||
            b.seq - a.seq,
        );
      const out: RequiredRelease[] = [];
      let budget = send.amount;
      for (const c of [...own, ...others]) {
        if (budget <= 0) break;
        const amount = Math.min(budget, c.amount - c.released);
        out.push({
          clawbackSeq: c.seq,
          debtorMembershipId: c.debtorMembershipId,
          amount,
          debtLeft: c.debt - c.releasedDebt,
        });
        budget -= amount;
      }
      return out;
    },
    /** Q1, Q3: a solidarity clawback and what has been released of it, if `seq` is one. */
    clawback: (seq: number): Readonly<SolidarityClawback> | undefined => clawbacks.get(seq),
    payouts: (): readonly SolidarityPayout[] => payouts,
  };
}
