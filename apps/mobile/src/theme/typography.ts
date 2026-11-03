// Type styles (DESIGN_SYSTEM.md 3.2): scale 32, 24, 19, 16, 14, 12; line height 1.4 for
// reading text, 1.25 for titles and figures. Colours are applied by components.
import type { TextStyle } from 'react-native';
import { fontFamily } from './fonts';

export type TypeStyleName =
  | 'amountDisplay'
  | 'screenTitle'
  | 'amountLarge'
  | 'groupTitle'
  | 'amountTotal'
  | 'sectionTitle'
  | 'body'
  | 'bodyStrong'
  | 'amount'
  | 'secondary'
  | 'secondaryStrong'
  | 'amountSmall'
  | 'caption'
  | 'captionStrong';

const tabular: TextStyle['fontVariant'] = ['tabular-nums'];

export const typography: Readonly<Record<TypeStyleName, TextStyle>> = {
  amountDisplay: { fontFamily: fontFamily.display700, fontSize: 32, lineHeight: 40, fontVariant: tabular },
  screenTitle: { fontFamily: fontFamily.display700, fontSize: 24, lineHeight: 30 },
  amountLarge: { fontFamily: fontFamily.display600, fontSize: 24, lineHeight: 30, fontVariant: tabular },
  groupTitle: { fontFamily: fontFamily.display700, fontSize: 19, lineHeight: 24 },
  amountTotal: { fontFamily: fontFamily.display700, fontSize: 19, lineHeight: 24, fontVariant: tabular },
  sectionTitle: { fontFamily: fontFamily.body700, fontSize: 19, lineHeight: 26 },
  body: { fontFamily: fontFamily.body400, fontSize: 16, lineHeight: 22 },
  bodyStrong: { fontFamily: fontFamily.body700, fontSize: 16, lineHeight: 22 },
  amount: { fontFamily: fontFamily.display600, fontSize: 16, lineHeight: 22, fontVariant: tabular },
  secondary: { fontFamily: fontFamily.body400, fontSize: 14, lineHeight: 20 },
  secondaryStrong: { fontFamily: fontFamily.body700, fontSize: 14, lineHeight: 20 },
  amountSmall: { fontFamily: fontFamily.display600, fontSize: 14, lineHeight: 20, fontVariant: tabular },
  caption: { fontFamily: fontFamily.body400, fontSize: 12, lineHeight: 17 },
  captionStrong: { fontFamily: fontFamily.body700, fontSize: 12, lineHeight: 17 },
};

/** Text-scale caps, the only exceptions to 200% scaling (DESIGN_SYSTEM.md 3.3, DD-10). */
export const fontScaleCaps = {
  tabLabel: 1.5,
  pinDigit: 1.3,
  /** At or above this scale the ring's centre text moves below the ring. */
  ringCentre: 1.3,
  /** At or above this scale list rows stack the amount under the title. */
  rowStack: 1.5,
} as const;
