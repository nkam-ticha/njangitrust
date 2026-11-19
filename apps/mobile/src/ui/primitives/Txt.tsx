// Text in one of the design system's styles and colours (DESIGN_SYSTEM.md 3.2).
import { Platform, Text, type TextProps } from 'react-native';
import { typography, useTheme, type ThemeColors, type TypeStyleName } from '@/theme';

export interface TxtProps extends TextProps {
  variant?: TypeStyleName;
  color?: keyof ThemeColors;
  align?: 'left' | 'center' | 'right';
}

// On the web the page itself is not selectable (see app/_layout.tsx), but text always is, so a
// member can select and copy any text. Wrap words and long URLs cleanly so text never overflows.
const webTextProps =
  Platform.OS === 'web'
    ? ({
        userSelect: 'text' as const,
        wordBreak: 'break-word' as const,
        overflowWrap: 'anywhere' as const,
      } as const)
    : null;

export function Txt({ variant = 'body', color = 'textPrimary', align, style, ...rest }: TxtProps) {
  const { colors } = useTheme();
  return (
    <Text
      {...rest}
      style={[
        typography[variant],
        { color: colors[color] },
        align ? { textAlign: align } : null,
        webTextProps,
        style,
      ]}
    />
  );
}
