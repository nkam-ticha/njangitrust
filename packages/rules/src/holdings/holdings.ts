// What members still hold in a group (D28). A group a developer closes, or an account a member
// deletes, must not leave a debt to pay, a live loan or a balance behind. The API counts these
// from its tables; this is the rule: which loans are live, what a settled balance is, and when the
// counts mean "money is held". Pure, integers only.

/** A loan still running its course: asked for, approved (to be sent), sent, or late. */
export const LIVE_LOAN_STATUSES = ['REQUESTED', 'APPROVED', 'DISBURSED', 'OVERDUE'] as const;

export function isLiveLoan(status: string): boolean {
  return (LIVE_LOAN_STATUSES as readonly string[]).includes(status);
}

export interface HeldMoneyCounts {
  /** Obligations still due. */
  obligations: number;
  /** Live loans (see `LIVE_LOAN_STATUSES`). */
  loans: number;
  /** Member ledger accounts whose balance is not zero (see `nonZeroBalanceCount`). */
  balances: number;
  /**
   * Bidding-round pots holding money (D10): contributions paid before the bids close sit in
   * `pot:round:<id>` and belong to no member yet (see `nonZeroBalanceCount`).
   */
  pots: number;
}

function wholeCount(value: number, what: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${what} must be a whole number, zero or more`);
  }
  return value;
}

/** True when money is still held: a debt, a live loan, a non-zero balance or a pot (D10, D28). */
export function holdsMoney(counts: HeldMoneyCounts): boolean {
  return (
    wholeCount(counts.obligations, 'obligations') +
      wholeCount(counts.loans, 'loans') +
      wholeCount(counts.balances, 'balances') +
      wholeCount(counts.pots, 'pots') >
    0
  );
}

/**
 * How many accounts hold a balance. `amount` is the sum of an account's postings in whole FCFA,
 * null when nothing was posted; a balance of either sign is held money (a credit the member can
 * withdraw, or a debt on the member).
 */
export function nonZeroBalanceCount(
  sums: readonly { account: string; amount: number | null }[],
): number {
  let count = 0;
  for (const { amount } of sums) {
    if (amount === null) continue;
    if (!Number.isSafeInteger(amount)) {
      throw new RangeError('a balance must be a whole number of FCFA');
    }
    if (amount !== 0) count += 1;
  }
  return count;
}
