// Helpers shared by the posting builders (internal to the ledger topic).

import { assertNonNegativeFcfa, type Fcfa } from '../money';
import type { Posting } from './types';

/** A whole, strictly positive FCFA amount, or a RangeError. */
export function positive(amount: number, label: string): Fcfa {
  assertNonNegativeFcfa(amount, label);
  if (amount === 0) throw new RangeError(`${label} must be above zero`);
  return amount;
}

/** Appends a posting unless its amount is zero (2.5: zero postings are omitted). */
export function post(out: Posting[], account: string, amount: number): void {
  if (amount !== 0) out.push({ account, amount });
}
