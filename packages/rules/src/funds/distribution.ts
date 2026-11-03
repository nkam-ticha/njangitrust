// End-of-cycle distribution of the general fund (R9.3, R9.4, R7.8). The solidarity fund is never
// distributed (R10.5).

import { assertNonNegativeFcfa, floorDiv, type Fcfa } from '../money';
import type { Refusal } from '../result';

export interface DistributionCandidate {
  membershipId: string;
  /** R9.3, R9.4: active from the cycle's start to its close (not joined later, not left). */
  activeWholeCycle: boolean;
  /** R9.3, R7.8: everything the member still owes the general fund. */
  outstandingDebt: Fcfa;
}

/**
 * R9.3: at cycle close, if distributeFundAtCycleEnd is on, X = the general fund's balance minus debts
 * still owed to it (money actually collected; never more than is available for loans, so money in
 * flight or reserved is never shared). X is shared among members active the whole cycle with no
 * outstanding debt: each gets floor(X / n); the remainder stays in the fund. Candidates are given in
 * rotation order and shares come back in that order.
 */
export function fundDistribution(input: {
  distributeFundAtCycleEnd: boolean;
  generalFundBalance: Fcfa;
  outstandingReceivables: Fcfa;
  availableForLoans: Fcfa;
  candidates: readonly DistributionCandidate[];
}):
  | {
      ok: true;
      distributable: Fcfa;
      share: Fcfa;
      shares: { membershipId: string; amount: Fcfa }[];
      distributed: Fcfa;
      remainder: Fcfa;
    }
  | Refusal<'DISTRIBUTION_OFF' | 'NOTHING_TO_DISTRIBUTE' | 'NO_ELIGIBLE_MEMBER'> {
  if (!input.distributeFundAtCycleEnd) return { ok: false, code: 'DISTRIBUTION_OFF' };
  assertNonNegativeFcfa(input.outstandingReceivables, 'outstandingReceivables');
  assertNonNegativeFcfa(input.availableForLoans, 'availableForLoans');
  const collected = Math.max(0, input.generalFundBalance - input.outstandingReceivables);
  const distributable = Math.min(collected, input.availableForLoans);
  const eligible = input.candidates.filter((c) => c.activeWholeCycle && c.outstandingDebt === 0);
  if (eligible.length === 0) return { ok: false, code: 'NO_ELIGIBLE_MEMBER' };
  const share = floorDiv(distributable, eligible.length);
  if (share === 0) return { ok: false, code: 'NOTHING_TO_DISTRIBUTE' };
  const distributed = share * eligible.length;
  return {
    ok: true,
    distributable,
    share,
    shares: eligible.map((c) => ({ membershipId: c.membershipId, amount: share })),
    distributed,
    remainder: distributable - distributed,
  };
}
