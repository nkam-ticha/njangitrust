// Lucide outline icons at 24 dp with a 2 px stroke (spec 1.2, DESIGN_SYSTEM.md 4.6).
// Smaller sizes keep the 2 px stroke. Decorative unless given a label.
import type { ComponentType } from 'react';
import { useTheme, type ThemeColors } from '@/theme';

export interface LucideLikeProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}
export type IconComponent = ComponentType<LucideLikeProps>;

interface IconProps {
  as: IconComponent;
  size?: 24 | 20 | 16 | 14;
  color?: keyof ThemeColors;
}

export function Icon({ as: Glyph, size = 24, color = 'iconPrimary' }: IconProps) {
  const { colors } = useTheme();
  return <Glyph size={size} color={colors[color]} strokeWidth={2} />;
}
