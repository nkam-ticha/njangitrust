// Motion tokens (DESIGN_SYSTEM.md 7.2). Everything runs on React Native's Animated (D4).
import { Easing } from 'react-native';

export const duration = {
  pressOut: 120,
  crossFade: 160,
  sheetIn: 240,
  sheetOut: 200,
  dialogIn: 160,
  dialogOut: 120,
  reducedFade: 120,
  /** Contribution landing (spec 1.2). */
  pulse: 600,
  /** Round fully paid: raffia sweep (spec 1.2). */
  sweep: 1200,
  typingStep: 300,
} as const;

export const easing = {
  out: Easing.out((t: number) => Easing.cubic(t)),
  in: Easing.in((t: number) => Easing.cubic(t)),
  inOut: Easing.inOut((t: number) => Easing.cubic(t)),
  outQuad: Easing.out((t: number) => Easing.quad(t)),
} as const;
