// The arithmetic of the amount slider (DESIGN_SYSTEM.md 5.2), pure and tested. It only chooses a
// position on a scale of whole FCFA between two limits the server gave; it never computes money.

/** 500 FCFA below 5 000, 1 000 from there (DESIGN_SYSTEM.md 5.2). */
export const stepFor = (value: number): number => (value < 5000 ? 500 : 1000);

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** The nearest step, kept inside [min, max]. Always a whole number. */
export function snap(value: number, min: number, max: number, step?: number): number {
  const s = step ?? stepFor(value);
  return clamp(Math.round(Math.round(value) / s) * s, min, max);
}

/** One step up (1) or down (-1), `times` steps at once for the page keys. Never leaves [min, max]. */
export function nudge(
  value: number,
  direction: 1 | -1,
  min: number,
  max: number,
  options: { step?: number; times?: number } = {},
): number {
  const times = options.times ?? 1;
  const s = options.step ?? stepFor(value);
  const target = value + direction * s * times;
  const next = snap(target, min, max, options.step);
  // A value off the grid (the maximum, say) must still move in the asked direction.
  if (direction === 1 && next <= value) return clamp(value + s, min, max);
  if (direction === -1 && next >= value) return clamp(value - s, min, max);
  return next;
}

/** Where a value sits on the track, 0 to 1. */
export function ratioOf(value: number, min: number, max: number): number {
  return max > min ? (clamp(value, min, max) - min) / (max - min) : 0;
}

/** The value under a position on the track (0 to 1), snapped. */
export function valueAt(ratio: number, min: number, max: number, step?: number): number {
  return snap(min + clamp(ratio, 0, 1) * (max - min), min, max, step);
}

/** Amounts offered as one-tap choices below the limit, never the limit itself (it has its own). */
const PRESETS = [10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];

export function presetAmounts(limit: number, count = 3): number[] {
  return PRESETS.filter((p) => p < limit).slice(0, count);
}
