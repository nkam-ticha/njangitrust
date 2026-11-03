// Fee schedule (R4.4, spec 2.6, 2.16 FEE_SCHEDULE) and disbursement fees (R4.3).

import { assertNonNegativeFcfa, floorDiv, roundHalfUpDiv, type Fcfa } from '../money';
import type { Refusal } from '../result';

export type FeeKind = 'COLLECTION' | 'DISBURSEMENT';
export type FeeSource = 'PROVIDER' | 'SCHEDULE';

/** One tier: applies to amounts up to `upTo` (null = no limit). Fee = fixed + rate, rounded half up. */
export interface FeeTier {
  upTo: number | null;
  fixed: Fcfa;
  ratePermille: number;
}

/** R4.4: the configured schedule used when the provider doesn't return a fee. */
export interface FeeSchedule {
  collection: FeeTier[];
  disbursement: FeeTier[];
}

/** Spec 2.6: the MockProvider's fixture fees, 100 FCFA per collection and 500 per disbursement. */
export const MOCK_FEE_SCHEDULE: Readonly<FeeSchedule> = Object.freeze({
  collection: [{ upTo: null, fixed: 100, ratePermille: 0 }],
  disbursement: [{ upTo: null, fixed: 500, ratePermille: 0 }],
});

const isWhole = (v: unknown, max = Number.MAX_SAFE_INTEGER) =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max;

function tiersProblem(tiers: unknown): string | null {
  if (!Array.isArray(tiers) || tiers.length === 0) return 'each list needs at least one tier';
  let previous = -1;
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i] as Partial<FeeTier>;
    const last = i === tiers.length - 1;
    if (!isWhole(tier.fixed) || !isWhole(tier.ratePermille, 1000))
      return 'fees must be whole numbers';
    if (last ? tier.upTo !== null : !isWhole(tier.upTo)) return 'only the last tier is open-ended';
    if (!last && (tier.upTo as number) <= previous) return 'tiers must be in increasing order';
    if (!last) previous = tier.upTo as number;
  }
  return null;
}

/** R4.4: checks a fee schedule (from the FEE_SCHEDULE setting) before it is used. */
export function validateFeeSchedule(
  schedule: FeeSchedule,
): { ok: true } | Refusal<'INVALID_FEE_SCHEDULE', { reason: string }> {
  for (const tiers of [schedule?.collection, schedule?.disbursement]) {
    const reason = tiersProblem(tiers);
    if (reason) return { ok: false, code: 'INVALID_FEE_SCHEDULE', reason };
  }
  return { ok: true };
}

function tierFee(tier: FeeTier, amount: Fcfa): Fcfa {
  return tier.fixed + roundHalfUpDiv(BigInt(amount) * BigInt(tier.ratePermille), 1000n);
}

/** R4.4: the scheduled fee for a collection or disbursement of `amount`. */
export function scheduleFee(schedule: FeeSchedule, kind: FeeKind, amount: Fcfa): Fcfa {
  assertNonNegativeFcfa(amount);
  const tiers = kind === 'COLLECTION' ? schedule.collection : schedule.disbursement;
  const tier = tiers.find((t) => t.upTo === null || amount <= t.upTo);
  if (!tier) throw new RangeError('the fee schedule has no tier for this amount');
  return tierFee(tier, amount);
}

/** R4.4, spec 2.6 rule 5: the provider's fee when it returned one, otherwise the schedule's. */
export function resolveFee(input: {
  providerFee: number | null | undefined;
  schedule: FeeSchedule;
  kind: FeeKind;
  amount: Fcfa;
}): { fee: Fcfa; feeSource: FeeSource } {
  if (input.providerFee !== null && input.providerFee !== undefined) {
    assertNonNegativeFcfa(input.providerFee, 'provider fee');
    return { fee: input.providerFee, feeSource: 'PROVIDER' };
  }
  return { fee: scheduleFee(input.schedule, input.kind, input.amount), feeSource: 'SCHEDULE' };
}

/**
 * R4.3, R5.4: the largest amount W such that W plus its estimated disbursement fee fits in
 * `spendable`, or 0 when nothing fits. Searches each tier, where W + fee(W) only grows with W.
 */
export function maxAmountWithinFee(spendable: Fcfa, schedule: FeeSchedule): Fcfa {
  assertNonNegativeFcfa(spendable, 'spendable');
  let best = 0;
  let lower = 0;
  for (const tier of schedule.disbursement) {
    const upper = Math.min(tier.upTo ?? spendable, spendable);
    let lo = lower;
    let hi = upper;
    let found = -1;
    while (lo <= hi) {
      const mid = lo + floorDiv(hi - lo, 2);
      if (mid + tierFee(tier, mid) <= spendable) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (found > best) best = found;
    if (tier.upTo === null || tier.upTo >= spendable) break;
    lower = tier.upTo + 1;
  }
  return best;
}

/** R4.3: actual minus estimated disbursement fee, absorbed by the general fund in the same entry. */
export function feeDifference(feeEstimated: Fcfa, feeActual: Fcfa): number {
  assertNonNegativeFcfa(feeEstimated, 'feeEstimated');
  assertNonNegativeFcfa(feeActual, 'feeActual');
  return feeActual - feeEstimated;
}
