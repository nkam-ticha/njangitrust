// Spacing, radii, sizes and elevation (DESIGN_SYSTEM.md 4).
import type { ViewStyle } from 'react-native';
import type { ColorScheme, ThemeColors } from './colors';

/** 4 dp base on an 8 dp rhythm (4.1). */
export const space = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s8: 32,
  s10: 40,
  s12: 48,
  s16: 64,
} as const;

/** Only three radii exist (4.3). */
export const radius = {
  sheet: 20,
  group: 12,
  full: 999,
} as const;

export const size = {
  touch: 48,
  header: 56,
  tabBar: 64,
  icon: 24,
  iconSmall: 20,
  iconTiny: 16,
  rowMin: 56,
  rowTwoLine: 72,
  avatar: 40,
} as const;

/** The two raised surfaces (2.4, 4.4). Dark mode lifts the surface instead of shadowing it. */
export function elevation(kind: 'card' | 'sheet' | 'dialog', colors: ThemeColors, scheme: ColorScheme): ViewStyle {
  if (scheme === 'dark') return {};
  const shadow = {
    card: { y: 2, blur: 12, alpha: 0.1, android: 3 },
    sheet: { y: -2, blur: 24, alpha: 0.16, android: 12 },
    dialog: { y: 8, blur: 24, alpha: 0.16, android: 12 },
  }[kind];
  return {
    shadowColor: colors.shadow,
    shadowOpacity: shadow.alpha,
    shadowRadius: shadow.blur / 2,
    shadowOffset: { width: 0, height: shadow.y },
    elevation: shadow.android,
  };
}
