// Semantic colour aliases (DESIGN_SYSTEM.md 2.2). Components use these, never palette tokens.
// Every alias is a token, or a token at an opacity; no other hue exists.
import { darkPalette, lightPalette, withAlpha, type Palette } from './palette';

export type ColorScheme = 'light' | 'dark';

export interface ThemeColors {
  canvas: string;
  surfaceRaised: string;
  surfaceTint: string;
  bubbleOwn: string;
  bubbleOther: string;
  selectedTint: string;
  hoverLayer: string;
  disabledFill: string;
  dangerTint: string;
  scrim: string;
  textPrimary: string;
  textSecondary: string;
  textOnPrimary: string;
  textLink: string;
  textDanger: string;
  primary: string;
  primaryPressed: string;
  danger: string;
  dangerPressed: string;
  divider: string;
  outline: string;
  focusRing: string;
  iconPrimary: string;
  iconSecondary: string;
  iconActive: string;
  statusPaid: string;
  statusLate: string;
  statusPending: string;
  accentRaffia: string;
  raffiaKeyline: string;
  onRaffia: string;
  /** Ndop band and app icon: brand constants that keep their light values in dark mode. */
  brandGround: string;
  brandMotif: string;
  /** Shadow colour for the two raised surfaces (light mode only, 2.4). */
  shadow: string;
}

/** Composite of `top` at `alpha` over the opaque `base` (used for the dark raised surface). */
function blendHex(top: string, alpha: number, base: string): string {
  const t = parseInt(top.slice(1), 16);
  const b = parseInt(base.slice(1), 16);
  const ch = (shift: number) => Math.round(((t >> shift) & 255) * alpha + ((b >> shift) & 255) * (1 - alpha));
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function build(p: Palette, scheme: ColorScheme): ThemeColors {
  const dark = scheme === 'dark';
  const canvas = dark ? p.night : p.cloud;
  const onPrimary = dark ? p.night : p.cloud;
  return {
    canvas,
    surfaceRaised: dark ? blendHex(p.indigo, 0.08, p.night) : p.cloud,
    surfaceTint: withAlpha(p.indigoInk, dark ? 0.08 : 0.06),
    bubbleOwn: withAlpha(p.indigo, dark ? 0.2 : 0.14),
    bubbleOther: withAlpha(p.indigoInk, dark ? 0.08 : 0.06),
    selectedTint: withAlpha(p.indigo, dark ? 0.14 : 0.1),
    hoverLayer: withAlpha(p.indigoInk, dark ? 0.06 : 0.05),
    disabledFill: withAlpha(p.indigoInk, dark ? 0.1 : 0.08),
    dangerTint: withAlpha(p.late, dark ? 0.14 : 0.1),
    scrim: withAlpha(p.night, dark ? 0.72 : 0.48),
    textPrimary: p.indigoInk,
    textSecondary: withAlpha(p.indigoInk, 0.72),
    textOnPrimary: onPrimary,
    textLink: p.indigo,
    textDanger: p.late,
    primary: p.indigo,
    primaryPressed: blendHex(onPrimary, 0.14, p.indigo),
    danger: p.late,
    dangerPressed: blendHex(onPrimary, 0.14, p.late),
    divider: p.line,
    outline: withAlpha(p.indigoInk, 0.56),
    focusRing: p.indigo,
    iconPrimary: p.indigoInk,
    iconSecondary: withAlpha(p.indigoInk, 0.72),
    iconActive: p.indigo,
    statusPaid: p.paid,
    statusLate: p.late,
    statusPending: p.pending,
    accentRaffia: p.raffia,
    raffiaKeyline: dark ? p.raffia : p.indigo,
    onRaffia: dark ? p.night : p.indigo,
    brandGround: lightPalette.indigo,
    brandMotif: lightPalette.cloud,
    shadow: p.night,
  };
}

export const lightColors: ThemeColors = build(lightPalette, 'light');
export const darkColors: ThemeColors = build(darkPalette, 'dark');
