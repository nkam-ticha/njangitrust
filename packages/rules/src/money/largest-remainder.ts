// Largest remainder splits (3.3): fee shares (R4.2) and equal splits among members (R12.3).

import { assertNonNegativeFcfa, toSafeInteger, type Fcfa } from './amounts';

/**
 * 3.3: largest remainder split of `total` in proportion to `weights`. Floors every share, then gives
 * the remaining francs one by one to the largest fractional parts. Ties go to the earlier index, so
 * callers pass the weights in the fixed tie order (contribution, shortfall, solidarity, debt; then
 * rotation order for members).
 */
export function largestRemainderSplit(total: number, weights: readonly number[]): Fcfa[] {
  assertNonNegativeFcfa(total, 'total');
  if (weights.length === 0) throw new RangeError('at least one weight is required');
  let weightSum = 0n;
  for (const w of weights) {
    assertNonNegativeFcfa(w, 'weight');
    weightSum += BigInt(w);
  }
  if (weightSum === 0n) {
    if (total === 0) return weights.map(() => 0);
    throw new RangeError('weights must not all be zero');
  }
  const T = BigInt(total);
  const floors: bigint[] = [];
  const remainders: bigint[] = [];
  let allocated = 0n;
  for (const w of weights) {
    const product = T * BigInt(w);
    const floor = product / weightSum;
    floors.push(floor);
    remainders.push(product % weightSum); // same denominator for all, so comparable exactly
    allocated += floor;
  }
  const left = Number(T - allocated); // always fewer than weights.length
  const order = weights
    .map((_, i) => i)
    .sort((i, j) => {
      const ri = remainders[i]!;
      const rj = remainders[j]!;
      if (ri !== rj) return ri > rj ? -1 : 1;
      return i - j;
    });
  for (let k = 0; k < left; k++) {
    const i = order[k]!;
    floors[i] = floors[i]! + 1n;
  }
  return floors.map((f) => toSafeInteger(f, 'share'));
}

/** 3.3, R12.3: equal split of `total` into `count` shares; extra francs go to the first positions. */
export function splitEqually(total: number, count: number): Fcfa[] {
  if (!Number.isSafeInteger(count) || count <= 0) throw new RangeError('count must be positive');
  return largestRemainderSplit(
    total,
    Array.from({ length: count }, () => 1),
  );
}
