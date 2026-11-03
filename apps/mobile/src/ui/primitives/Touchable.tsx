// The one pressable primitive (DESIGN_SYSTEM.md 5.1, 7.3, 8.5):
// - pressed: a state layer at full strength on press-in, fading out in 120 ms on release;
// - hover (web, pointer): a lighter layer;
// - keyboard focus-visible: a 2 px focus ring with a 2 px gap, following the radius;
// - cursor: pointer when enabled.
import { useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { duration, useTheme } from '@/theme';
import { isKeyboardModality } from './focusVisible';

export interface TouchState {
  pressed: boolean;
  hovered: boolean;
}

export interface TouchableProps extends Omit<PressableProps, 'style' | 'children'> {
  children: ReactNode | ((state: TouchState) => ReactNode);
  style?: StyleProp<ViewStyle>;
  /** Corner radius of the state layers and the focus ring. */
  radius?: number;
  /** Colour of the pressed layer; `null` when the child draws its own pressed look. */
  pressedLayer?: string | null;
  hoverLayer?: string | null;
}

export function Touchable({
  children,
  style,
  radius = 12,
  pressedLayer,
  hoverLayer,
  disabled,
  onPressIn,
  onPressOut,
  onHoverIn,
  onHoverOut,
  onFocus,
  onBlur,
  ...rest
}: TouchableProps) {
  const { colors } = useTheme();
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const layer = useRef(new Animated.Value(0)).current;
  const pressColor = pressedLayer === undefined ? colors.selectedTint : pressedLayer;
  const hoverColor = hoverLayer === undefined ? colors.hoverLayer : hoverLayer;

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      accessibilityState={{ disabled: !!disabled, ...rest.accessibilityState }}
      onPressIn={(e) => {
        setPressed(true);
        layer.setValue(1);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        Animated.timing(layer, { toValue: 0, duration: duration.pressOut, useNativeDriver: true }).start();
        onPressOut?.(e);
      }}
      onHoverIn={(e) => {
        setHovered(true);
        onHoverIn?.(e);
      }}
      onHoverOut={(e) => {
        setHovered(false);
        onHoverOut?.(e);
      }}
      onFocus={(e) => {
        setFocused(isKeyboardModality());
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[{ borderRadius: radius, cursor: disabled ? 'auto' : 'pointer' }, style]}
    >
      {typeof children === 'function' ? children({ pressed, hovered }) : children}
      {hovered && !disabled && hoverColor ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, backgroundColor: hoverColor }]} />
      ) : null}
      {pressColor ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { borderRadius: radius, backgroundColor: pressColor, opacity: layer }]}
        />
      ) : null}
      {focused ? (
        <View
          pointerEvents="none"
          style={[styles.ring, { borderRadius: radius + 4, borderColor: colors.focusRing }]}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', top: -4, left: -4, right: -4, bottom: -4, borderWidth: 2 },
});
