// Ledger accounts of a group (2.5). Sign convention: debit is positive, credit is negative.

export const CASH_PROVIDER = 'cash:provider';
export const GENERAL_FUND = 'fund:general';
export const SOLIDARITY_FUND = 'fund:solidarity';

/**
 * CASH (asset), PAYABLE (liability: money the group owes a member), RECEIVABLE (asset: money a
 * member owes the general fund), GENERAL_FUND and SOLIDARITY_FUND (equity), and POT (liability:
 * contributions of a bidding round held until its beneficiary is known; an addition to 2.5).
 */
export type AccountKind =
  'CASH' | 'PAYABLE' | 'RECEIVABLE' | 'GENERAL_FUND' | 'SOLIDARITY_FUND' | 'POT';

const ID_PATTERN = /^[^:\s]+$/;

function checkId(id: string, what: string): string {
  if (!ID_PATTERN.test(id)) throw new RangeError(`invalid ${what} ID in an account name`);
  return id;
}

/** 2.5: `payable:member:<membershipId>`. */
export function payableAccount(membershipId: string): string {
  return `payable:member:${checkId(membershipId, 'membership')}`;
}

/** 2.5: `receivable:member:<membershipId>`. */
export function receivableAccount(membershipId: string): string {
  return `receivable:member:${checkId(membershipId, 'membership')}`;
}

/** `pot:round:<roundId>`: a bidding round's contributions before the bid closes (R8, R3.4). */
export function potAccount(roundId: string): string {
  return `pot:round:${checkId(roundId, 'round')}`;
}

/** 2.5: the kind and owner of an account name, or null if the name is not a valid account. */
export function parseAccount(account: string): { kind: AccountKind; id: string | null } | null {
  if (account === CASH_PROVIDER) return { kind: 'CASH', id: null };
  if (account === GENERAL_FUND) return { kind: 'GENERAL_FUND', id: null };
  if (account === SOLIDARITY_FUND) return { kind: 'SOLIDARITY_FUND', id: null };
  const prefixes: [string, AccountKind][] = [
    ['payable:member:', 'PAYABLE'],
    ['receivable:member:', 'RECEIVABLE'],
    ['pot:round:', 'POT'],
  ];
  for (const [prefix, kind] of prefixes) {
    if (account.startsWith(prefix)) {
      const id = account.slice(prefix.length);
      return ID_PATTERN.test(id) ? { kind, id } : null;
    }
  }
  return null;
}

/** 2.5: true for assets (cash, receivables), whose normal balance is a debit. */
export function isAssetKind(kind: AccountKind): boolean {
  return kind === 'CASH' || kind === 'RECEIVABLE';
}

/**
 * 2.5: the balance as people read it: assets debit-positive, liabilities and equity
 * credit-positive. A payable of 9 909 owed to M7 is stored as −9 909 and read as 9 909.
 */
export function naturalBalance(account: string, rawBalance: number): number {
  const parsed = parseAccount(account);
  if (!parsed) throw new RangeError(`unknown account ${account}`);
  return isAssetKind(parsed.kind) ? rawBalance : 0 - rawBalance; // 0 − x avoids −0
}
