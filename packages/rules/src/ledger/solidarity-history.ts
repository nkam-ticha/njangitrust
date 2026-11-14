// Who owes a solidarity shortfall (D17.2 refined by D18.3). When a reversed payment's solidarity
// part has already been paid out of the fund, the missing amount is owed by the recipient of the most
// recent solidarity payout, never more than that payout; any rest by the previous recipient, and so on
// backwards; if no recipient remains, by the member whose payment was reversed. A payout the operator
// reversed after completion (DISBURSEMENT_REFUNDED, D22.1) is back in the fund: it no longer counts
// as received and is skipped. The planner (corrections.ts) and the checker (correction-checks.ts) share this history.

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

type Observed = {
  seq: number;
  type: TransactionType;
  membershipId: string | null;
  postings: readonly Posting[];
  metadata: Readonly<Record<string, unknown>>;
};

/** Builds the history transaction by transaction (`observe`), then answers `allocate`. */
export function createSolidarityHistory() {
  const payouts: SolidarityPayout[] = [];
  const clawbacks = new Map<number, { payoutSeq: number | null; amount: Fcfa }>();
  const find = (seq: number | null) => payouts.find((p) => p.seq === seq);
  return {
    observe(tx: Observed): void {
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
      }
      if (tx.type === 'DISBURSEMENT_REFUNDED') {
        const payout = find(tx.metadata.completedSeq as number);
        if (payout) payout.refunded = true;
      }
      if (tx.type === 'CLAWBACK') {
        const fund = tx.postings.find((p) => p.account === SOLIDARITY_FUND);
        if (!fund) return;
        const payoutSeq = (tx.metadata.solidarityPayoutSeq as number | null | undefined) ?? null;
        clawbacks.set(tx.seq, { payoutSeq, amount: -fund.amount });
        const payout = find(payoutSeq);
        if (payout) payout.clawed += -fund.amount;
      }
      if (tx.type === 'REVERSAL') {
        // Disbursement entries are never reversed (D18.1); a reversed CLAWBACK frees its payout again.
        const target = tx.metadata.reversesSeq as number;
        const clawback = clawbacks.get(target);
        const clawed = clawback ? find(clawback.payoutSeq) : undefined;
        if (clawback && clawed) clawed.clawed -= clawback.amount;
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
    payouts: (): readonly SolidarityPayout[] => payouts,
  };
}
