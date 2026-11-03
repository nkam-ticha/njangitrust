// The four static font files (DESIGN_SYSTEM.md 3.1, D9). Each weight is its own family:
// `fontWeight` is never used to synthesise a weight. Loaded by the root layout with useFonts.

export const fontFamily = {
  display600: 'BricolageGrotesque-SemiBold',
  display700: 'BricolageGrotesque-Bold',
  body400: 'AtkinsonHyperlegible-Regular',
  body700: 'AtkinsonHyperlegible-Bold',
} as const;

export const fontSources = {
  [fontFamily.display600]: require('../../assets/fonts/BricolageGrotesque-SemiBold.ttf'),
  [fontFamily.display700]: require('../../assets/fonts/BricolageGrotesque-Bold.ttf'),
  [fontFamily.body400]: require('../../assets/fonts/AtkinsonHyperlegible-Regular.ttf'),
  [fontFamily.body700]: require('../../assets/fonts/AtkinsonHyperlegible-Bold.ttf'),
} as const;
