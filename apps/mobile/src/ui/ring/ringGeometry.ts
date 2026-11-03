// NjangiRing geometry (DESIGN_SYSTEM.md 6.2, 6.3, 6.6). Pure functions, no React.

export type RingSize = 'large' | 'largeSmall' | 'wide' | 'panel' | 'header' | 'thumb';

export interface RingSpec {
  S: number;
  R: number;
  rMax: number;
  rMin: number;
  outline: number;
  late: number;
  track: number;
  beneficiaryScale: number;
  keyline: number;
  servedBadge: boolean;
  segmentWidth: number;
}

export const RING_SPECS: Readonly<Record<RingSize, RingSpec>> = {
  large: { S: 280, R: 118, rMax: 9, rMin: 3.5, outline: 2, late: 3, track: 2, beneficiaryScale: 1.33, keyline: 1.5, servedBadge: true, segmentWidth: 3 },
  largeSmall: { S: 248, R: 104, rMax: 8, rMin: 3.5, outline: 2, late: 3, track: 2, beneficiaryScale: 1.33, keyline: 1.5, servedBadge: true, segmentWidth: 3 },
  wide: { S: 320, R: 136, rMax: 10, rMin: 3.5, outline: 2, late: 3, track: 2, beneficiaryScale: 1.33, keyline: 1.5, servedBadge: true, segmentWidth: 3 },
  panel: { S: 240, R: 100, rMax: 8, rMin: 3.5, outline: 2, late: 3, track: 2, beneficiaryScale: 1.33, keyline: 1.5, servedBadge: true, segmentWidth: 3 },
  header: { S: 64, R: 26, rMax: 3.5, rMin: 1.75, outline: 1.25, late: 1.75, track: 1, beneficiaryScale: 1.33, keyline: 1, servedBadge: false, segmentWidth: 3 },
  thumb: { S: 40, R: 15.5, rMax: 2.5, rMin: 1.5, outline: 1, late: 1.5, track: 1, beneficiaryScale: 1.4, keyline: 0.75, servedBadge: false, segmentWidth: 2.5 },
};

export interface RingLayout {
  spec: RingSpec;
  /** Dot radius; ignored in segment mode. */
  r: number;
  /** True when dots would be smaller than rMin: members are drawn as arcs. */
  segments: boolean;
}

/** r = min(rMax, 0.3 × chord), chord = 2R·sin(π/n) (6.3). */
export function ringLayout(size: RingSize, n: number): RingLayout {
  const spec = RING_SPECS[size];
  const chord = 2 * spec.R * Math.sin(Math.PI / Math.max(n, 2));
  const r = Math.min(spec.rMax, 0.3 * chord);
  return { spec, r, segments: r < spec.rMin };
}

/** Offset of member k from the beneficiary b, so the beneficiary sits at 12 o'clock (6.2). */
export function offsetFromBeneficiary(k: number, b: number, n: number): number {
  return (((k - b) % n) + n) % n;
}

/** Angle in degrees, clockwise from 12 o'clock expressed in screen coordinates (−90 = top). */
export function angleFor(offset: number, n: number): number {
  return -90 + (offset * 360) / n;
}

export function polar(c: number, R: number, deg: number): { x: number; y: number } {
  const a = (deg * Math.PI) / 180;
  return { x: c + R * Math.cos(a), y: c + R * Math.sin(a) };
}

/** SVG path for an arc of the track centred on `deg`, spanning `span` degrees, drawn clockwise. */
export function arcPath(c: number, R: number, deg: number, span: number): string {
  const a = polar(c, R, deg - span / 2);
  const b = polar(c, R, deg + span / 2);
  return `M${a.x.toFixed(2)} ${a.y.toFixed(2)} A${R} ${R} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

/**
 * Nearest member to a touch at (x, y) inside the ring box, or null if the touch is more than
 * 28 dp from the track (6.6). `b` is the beneficiary index (0 when unknown).
 */
export function memberAt(x: number, y: number, size: RingSize, n: number, b: number): number | null {
  const { S, R } = RING_SPECS[size];
  const c = S / 2;
  const dx = x - c;
  const dy = y - c;
  if (Math.abs(Math.hypot(dx, dy) - R) > 28) return null;
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const offset = Math.round((((deg + 90) % 360) + 360) % 360 / (360 / n)) % n;
  return (offset + b) % n;
}
