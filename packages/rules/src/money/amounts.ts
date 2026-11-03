// Money primitives (3.3). Every amount is a whole number of FCFA held in a JS number that must be a
// safe integer. Products that could pass 2^53 are computed with BigInt. No floating point.

/** A whole number of francs CFA (XAF). Always a safe integer. */
export type Fcfa = number;

/** 3.3: true when the value is a whole number of FCFA (a safe integer). */
export function isFcfa(value: unknown): value is Fcfa {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/** 3.3: throws a RangeError unless the value is a whole number of FCFA. */
export function assertFcfa(value: number, label = 'amount'): asserts value is Fcfa {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a whole number of FCFA; got ${String(value)}`);
  }
}

/** 3.3: throws unless the value is a whole, non-negative number of FCFA. */
export function assertNonNegativeFcfa(value: number, label = 'amount'): asserts value is Fcfa {
  assertFcfa(value, label);
  if (value < 0) throw new RangeError(`${label} must not be negative; got ${value}`);
}

/** 3.3: converts an exact BigInt result back to a safe integer, or throws. */
export function toSafeInteger(value: bigint, label = 'value'): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(`${label} is outside the safe integer range`);
  }
  return Number(value);
}

function checkInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${label} must be an integer`);
  return value;
}

/** 3.3: exact sum of FCFA amounts. */
export function sumFcfa(amounts: readonly number[]): Fcfa {
  let total = 0n;
  for (const a of amounts) {
    assertFcfa(a);
    total += BigInt(a);
  }
  return toSafeInteger(total, 'sum');
}

/** 3.3: floor(a / b) for a non-negative integer and a positive one, without floating point. */
export function floorDiv(a: number, b: number): number {
  assertNonNegativeFcfa(a, 'a');
  if (!Number.isSafeInteger(b) || b <= 0)
    throw new RangeError('divisor must be a positive integer');
  return (a - (a % b)) / b; // exact: the numerator is a multiple of b
}

/** 3.3: floor(a × b / c) for non-negative integers, exact (BigInt intermediate). */
export function mulDivFloor(a: number, b: number, c: number): number {
  assertNonNegativeFcfa(a, 'a');
  assertNonNegativeFcfa(b, 'b');
  assertFcfa(c, 'c');
  if (c <= 0) throw new RangeError('divisor must be positive');
  return toSafeInteger((BigInt(a) * BigInt(b)) / BigInt(c), 'mulDivFloor');
}

/** 3.3: numerator / denominator rounded half up, for non-negative integers (R7.3 interest, R14.1). */
export function roundHalfUpDiv(numerator: number | bigint, denominator: number | bigint): number {
  const n =
    typeof numerator === 'bigint' ? numerator : BigInt(checkInteger(numerator, 'numerator'));
  const d =
    typeof denominator === 'bigint'
      ? denominator
      : BigInt(checkInteger(denominator, 'denominator'));
  if (d <= 0n) throw new RangeError('denominator must be positive');
  if (n < 0n) throw new RangeError('numerator must not be negative');
  return toSafeInteger((2n * n + d) / (2n * d), 'roundHalfUpDiv');
}
