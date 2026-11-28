// Payout credits still locked until their round's payout time (R5.2), read back from the ledger.
// The withdrawal check used to rebuild these in the service; here they are one pure function.

import { accountCreditsTotal, partNetCredit, type PayoutCredit } from '../ledger';

/** A ledger entry as the withdrawal check reads it: its type, round, metadata and postings. */
export interface CreditLedgerEntry {
  type: string;
  roundId: string | null;
  metadata: unknown;
  postings: readonly { account: string; amount: number }[];
}

/**
 * R5.2, R4.2, D10: the credits on a member's payable and when each unlocks, in ledger order.
 * - Each CONTRIBUTION part of a PAYMENT_RECEIVED entry that credits `payable`, net of its fee
 *   share (partNetCredit), unlocks at the payout time of its round (`contributionUnlockAt`, by
 *   obligation id). A part with an unknown obligation or a figure that is not a whole number is
 *   skipped.
 * - Each POT_ASSIGNED entry of a round the member is beneficiary of credits the pot it moved to
 *   the payable, unlocked at that round's payout time (`potUnlockAt`, by round id).
 * Contribution credits come first, then pot credits.
 */
export function lockedPayoutCredits(input: {
  payable: string;
  entries: readonly CreditLedgerEntry[];
  contributionUnlockAt: ReadonlyMap<string, Date>;
  potUnlockAt: ReadonlyMap<string, Date>;
}): PayoutCredit[] {
  const credits: PayoutCredit[] = [];
  for (const entry of input.entries) {
    if (entry.type !== 'PAYMENT_RECEIVED') continue;
    const metadata = entry.metadata as { parts?: unknown } | null;
    if (!metadata || !Array.isArray(metadata.parts)) continue;
    for (const value of metadata.parts) {
      if (!value || typeof value !== 'object') continue;
      const part = value as Record<string, unknown>;
      if (
        part.kind !== 'CONTRIBUTION' ||
        part.account !== input.payable ||
        typeof part.obligationId !== 'string'
      )
        continue;
      const payoutAt = input.contributionUnlockAt.get(part.obligationId);
      if (!payoutAt || !Number.isSafeInteger(part.amount) || !Number.isSafeInteger(part.feeShare))
        continue;
      credits.push({
        amount: partNetCredit({ amount: Number(part.amount), feeShare: Number(part.feeShare) }),
        payoutAt,
      });
    }
  }
  for (const entry of input.entries) {
    if (entry.type !== 'POT_ASSIGNED' || !entry.roundId) continue;
    const payoutAt = input.potUnlockAt.get(entry.roundId);
    if (!payoutAt) continue;
    // One credit per posting, as the ledger recorded them.
    for (const posting of entry.postings) {
      if (posting.account !== input.payable || posting.amount >= 0) continue;
      credits.push({ amount: accountCreditsTotal(input.payable, [posting]), payoutAt });
    }
  }
  return credits;
}
