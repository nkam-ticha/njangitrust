// Badges (DESIGN_SYSTEM.md 5.6): label badges ("Vote secret", "Admin", "Nouveau membre"),
// count badges (bell, tabs) and the dot badge (Njangi tab, private reply waiting).
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, space, useTheme } from '@/theme';
import { Txt } from '../primitives/Txt';
import type { IconComponent } from '../primitives/Icon';

interface LabelBadgeProps {
  label: string;
  icon?: IconComponent;
}

export function LabelBadge({ label, icon: Glyph }: LabelBadgeProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.label, { borderColor: colors.outline }]}>
      {Glyph ? <Glyph size={14} color={colors.iconPrimary} strokeWidth={2} /> : null}
      <Txt variant="captionStrong">{label}</Txt>
    </View>
  );
}

interface CountBadgeProps {
  count: number;
  style?: StyleProp<ViewStyle>;
}

/** Decorative: the count belongs in the parent's accessibility label. */
export function CountBadge({ count, style }: CountBadgeProps) {
  const { colors } = useTheme();
  if (count <= 0) return null;
  return (
    <View importantForAccessibility="no" accessibilityElementsHidden style={[styles.count, { backgroundColor: colors.primary }, style]}>
      <Txt variant="captionStrong" style={{ color: colors.textOnPrimary }} maxFontSizeMultiplier={1.5}>
        {count > 99 ? '99+' : String(count)}
      </Txt>
    </View>
  );
}

export function DotBadge({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View importantForAccessibility="no" style={[styles.dot, { backgroundColor: colors.primary }, style]} />;
}

const styles = StyleSheet.create({
  label: {
    minHeight: 24,
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: space.s2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s1,
    alignSelf: 'flex-start',
  },
  count: {
    minWidth: 20,
    height: 20,
    borderRadius: radius.full,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 8, height: 8, borderRadius: radius.full },
});
