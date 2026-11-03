// Banners (DESIGN_SYSTEM.md 5.12): full-width strips under the header, never floating.
// They appear without animation and are announced politely. One at a time.
import { StyleSheet, View } from 'react-native';
import { CircleAlert, Info, ListChecks, WifiOff } from 'lucide-react-native';
import { space, useTheme } from '@/theme';
import { Txt } from '../primitives/Txt';
import { Button } from '../buttons/Button';
import type { IconComponent } from '../primitives/Icon';

export type BannerKind = 'offline' | 'error' | 'info' | 'summary';

interface BannerProps {
  kind: BannerKind;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Override the default icon (shield-alert for withdrawals paused). */
  icon?: IconComponent;
}

const ICONS: Record<BannerKind, IconComponent> = { offline: WifiOff, error: CircleAlert, info: Info, summary: ListChecks };

export function Banner({ kind, text, actionLabel, onAction, icon }: BannerProps) {
  const { colors } = useTheme();
  const Glyph = icon ?? ICONS[kind];
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.bar, { backgroundColor: kind === 'error' ? colors.dangerTint : colors.surfaceTint }]}
    >
      <Glyph size={20} color={kind === 'error' ? colors.statusLate : colors.iconPrimary} strokeWidth={2} />
      <Txt variant="secondary" style={styles.flex}>{text}</Txt>
      {actionLabel && onAction ? <Button variant="text" label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: space.s2, paddingHorizontal: space.s4, paddingVertical: space.s1 },
  flex: { flex: 1 },
});
