// The nine colour tokens of spec 1.2, light and dark (docs/design/DESIGN_SYSTEM.md 2.1).
// The only hex values in the app (CLAUDE.md rule 12). Kept identical to
// docs/design/tools/check-contrast.mjs, which verifies every pair built from them.

export type TokenName =
  | 'indigo'
  | 'indigoInk'
  | 'night'
  | 'cloud'
  | 'line'
  | 'raffia'
  | 'paid'
  | 'late'
  | 'pending';

export type Palette = Readonly<Record<TokenName, string>>;

export const lightPalette: Palette = {
  indigo: '#1E2A5A',
  indigoInk: '#1B2140',
  night: '#141B3D',
  cloud: '#F5F6FA',
  line: '#D9DCE6',
  raffia: '#D9A520',
  paid: '#2E7D4F',
  late: '#B42318',
  pending: '#A86A0B',
};

export const darkPalette: Palette = {
  indigo: '#AEBBF0',
  indigoInk: '#E8EBF6',
  night: '#141B3D',
  cloud: '#F5F6FA',
  line: '#313A66',
  raffia: '#D9A520',
  paid: '#5DBB87',
  late: '#F08A7E',
  pending: '#C98A2E',
};

/** A token at an opacity, as an rgba() string: composites over whatever surface is behind it. */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
