// Public surface of the theme (docs/design/DESIGN_SYSTEM.md sections 2 to 8).
export { ThemeProvider, useTheme, type Theme, type ThemePreference } from './ThemeProvider';
export { lightColors, darkColors, type ThemeColors, type ColorScheme } from './colors';
export { lightPalette, darkPalette, withAlpha, type Palette, type TokenName } from './palette';
export { typography, fontScaleCaps, type TypeStyleName } from './typography';
export { fontFamily, fontSources } from './fonts';
export { space, radius, size, elevation } from './layout';
export { duration, easing } from './motion';
export { breakpoints, contentWidth, breakpointFor, useBreakpoint, type Breakpoint, type BreakpointInfo } from './breakpoints';
export { useReduceMotion } from './useReduceMotion';
