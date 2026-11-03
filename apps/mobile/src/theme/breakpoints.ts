// Breakpoints (DESIGN_SYSTEM.md 8.1, D1): same components, the layout adapts to the window.
import { useWindowDimensions } from 'react-native';

export type Breakpoint = 'compact' | 'medium' | 'expanded' | 'large';

export const breakpoints = {
  medium: 600,
  expanded: 1024,
  large: 1280,
} as const;

/** Maximum content widths (8.3). */
export const contentWidth = {
  reading: 720,
  form: 480,
  medium: 640,
  bubble: 560,
  card: 440,
  page: 1200,
} as const;

export function breakpointFor(width: number): Breakpoint {
  if (width >= breakpoints.large) return 'large';
  if (width >= breakpoints.expanded) return 'expanded';
  if (width >= breakpoints.medium) return 'medium';
  return 'compact';
}

export interface BreakpointInfo {
  breakpoint: Breakpoint;
  width: number;
  /** Bottom tabs and bottom sheets (phones). */
  isCompact: boolean;
  /** Sidebar, two-column layouts and centred dialogs. */
  isWide: boolean;
  /** Side panels on Njangi and Groupe. */
  isLarge: boolean;
  /** Screen gutter: 16, 24 or 32. */
  gutter: number;
}

export function useBreakpoint(): BreakpointInfo {
  const { width } = useWindowDimensions();
  const breakpoint = breakpointFor(width);
  return {
    breakpoint,
    width,
    isCompact: breakpoint === 'compact',
    isWide: breakpoint === 'expanded' || breakpoint === 'large',
    isLarge: breakpoint === 'large',
    gutter: breakpoint === 'compact' ? 16 : breakpoint === 'medium' ? 24 : 32,
  };
}
