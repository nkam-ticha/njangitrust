// Buttons (DESIGN_SYSTEM.md 5.1). Labels name exactly what happens ("Payer 11 000 FCFA").
// Offline, money and vote buttons read "Connexion requise" (spec 1.7).
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { WifiOff } from 'lucide-react-native';
import { radius, size, space, useTheme } from '@/theme';
import { Touchable } from '../primitives/Touchable';
import { Txt } from '../primitives/Txt';
import type { IconComponent } from '../primitives/Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'text';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconComponent;
  loading?: boolean;
  disabled?: boolean;
  /** Shows "Connexion requise" and disables the button. */
  offline?: boolean;
  fullWidth?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, variant = 'primary', icon: Glyph, loading, disabled, offline, fullWidth, accessibilityHint, style }: ButtonProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const inactive = !!disabled || !!offline;
  const shownLabel = offline ? t('offline.connectionRequired') : label;
  const shownIcon = offline ? WifiOff : Glyph;

  const fill = inactive
    ? colors.disabledFill
    : variant === 'primary'
      ? colors.primary
      : variant === 'destructive'
        ? colors.danger
        : 'transparent';
  const pressedFill = variant === 'primary' ? colors.primaryPressed : variant === 'destructive' ? colors.dangerPressed : null;
  const labelColor = inactive
    ? colors.textSecondary
    : variant === 'primary' || variant === 'destructive'
      ? colors.textOnPrimary
      : colors.textLink;
  const filled = variant === 'primary' || variant === 'destructive';

  return (
    <Touchable
      onPress={onPress}
      disabled={inactive || loading}
      accessibilityRole="button"
      accessibilityLabel={shownLabel}
      accessibilityHint={offline ? t('offline.actionsHint') : accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: !!loading }}
      radius={radius.group}
      pressedLayer={filled ? null : colors.selectedTint}
      hoverLayer={filled ? null : colors.hoverLayer}
      style={[fullWidth ? styles.full : styles.auto, style]}
    >
      {({ pressed, hovered }) => (
        <View
          style={[
            styles.box,
            variant === 'text' ? styles.textPad : styles.pad,
            {
              backgroundColor: !inactive && filled && (pressed || hovered) && pressedFill ? pressedFill : fill,
              borderColor: variant === 'secondary' && !inactive ? colors.primary : 'transparent',
              borderWidth: variant === 'secondary' ? 1.5 : 0,
            },
          ]}
        >
          {loading ? (
            <ActivityIndicator size="small" color={labelColor} />
          ) : (
            <>
              {shownIcon ? (() => { const I = shownIcon; return <I size={20} color={labelColor} strokeWidth={2} />; })() : null}
              <Txt variant="bodyStrong" style={{ color: labelColor }} numberOfLines={2} align="center">
                {shownLabel}
              </Txt>
            </>
          )}
        </View>
      )}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  full: { alignSelf: 'stretch' },
  auto: { alignSelf: 'flex-start' },
  box: {
    minHeight: size.touch,
    borderRadius: radius.group,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.s2,
  },
  pad: { paddingHorizontal: space.s5, paddingVertical: space.s3 },
  textPad: { paddingHorizontal: space.s3, paddingVertical: space.s3 },
});
