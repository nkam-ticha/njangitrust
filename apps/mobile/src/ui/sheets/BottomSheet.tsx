// Bottom sheet, built in-house (D4; DESIGN_SYSTEM.md 5.10, 7.3, 8.4): Animated, PanResponder and Modal.
// Phones: slides up from the bottom, drag down to dismiss. Wide screens: a centred dialog.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Modal, PanResponder, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { duration, easing, elevation, radius, size, space, useBreakpoint, useReduceMotion, useTheme } from '@/theme';
import { Touchable } from '../primitives/Touchable';
import { Txt } from '../primitives/Txt';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Sticky actions, kept above the keyboard and the gesture bar. */
  footer?: ReactNode;
  /** Above the title, inside the radius (the Ndop band on the withdraw sheet). */
  topSlot?: ReactNode;
  /** False while a PIN is being checked: no drag, no scrim tap, no back. */
  dismissible?: boolean;
  /** Dialog width on wide screens: 480 default, 520 withdraw, 400 PIN and pickers. */
  dialogWidth?: 400 | 480 | 520;
}

export function BottomSheet({ visible, onClose, title, children, footer, topSlot, dismissible = true, dialogWidth = 480 }: BottomSheetProps) {
  const { colors, scheme } = useTheme();
  const { t } = useTranslation();
  const { isWide, breakpoint } = useBreakpoint();
  const reduce = useReduceMotion();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current; // 0 hidden, 1 shown
  const drag = useRef(new Animated.Value(0)).current;
  const sheetH = useRef(winH);
  const dialog = isWide;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      drag.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: reduce ? duration.reducedFade : dialog ? duration.dialogIn : duration.sheetIn,
        easing: easing.out,
        useNativeDriver: true,
      }).start();
    } else if (mounted) {
      Animated.timing(progress, {
        toValue: 0,
        duration: reduce ? duration.reducedFade : dialog ? duration.dialogOut : duration.sheetOut,
        easing: easing.in,
        useNativeDriver: true,
      }).start(() => setMounted(false));
    }
  }, [visible, reduce, dialog, mounted, progress, drag]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = dismissible ? onClose : () => drag.setValue(0);
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > sheetH.current * 0.25 || g.vy > 0.5) onCloseRef.current();
        else Animated.spring(drag, { toValue: 0, friction: 9, tension: 80, useNativeDriver: true }).start();
      },
    }),
  ).current;

  if (!mounted) return null;

  const translateY = reduce || dialog ? 0 : Animated.add(progress.interpolate({ inputRange: [0, 1], outputRange: [sheetH.current, 0] }), drag);
  const scale = dialog && !reduce ? progress.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) : 1;
  const surfaceOpacity = reduce || dialog ? progress : 1;

  const header = (
    <View style={styles.head}>
      <Txt variant="groupTitle" accessibilityRole="header" style={styles.flex} numberOfLines={2}>{title}</Txt>
      {dismissible ? (
        <Touchable onPress={onClose} radius={24} accessibilityRole="button" accessibilityLabel={t('a11y.closeSheet')} style={styles.close}>
          <X size={24} color={colors.iconPrimary} strokeWidth={2} />
        </Touchable>
      ) : null}
    </View>
  );

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={() => {
      if (dismissible) onClose();
    }}>
      <View style={[styles.root, dialog && styles.rootDialog]} accessibilityViewIsModal>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: progress }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => {
            if (dismissible) onClose();
          }} accessibilityElementsHidden importantForAccessibility="no" />
        </Animated.View>
        <Animated.View
          onLayout={(e) => (sheetH.current = e.nativeEvent.layout.height)}
          style={[
            dialog ? [styles.dialog, { width: dialogWidth, maxHeight: winH * 0.85 }] : [styles.sheet, { maxHeight: winH * 0.92 }],
            { backgroundColor: colors.surfaceRaised, borderColor: colors.divider },
            elevation(dialog ? 'dialog' : 'sheet', colors, scheme),
            { opacity: surfaceOpacity, transform: [{ translateY }, { scale }] },
            !dialog && breakpoint === 'medium' && styles.sheetMedium,
          ]}
        >
          {topSlot}
          {dialog ? null : (
            <View {...(dismissible ? pan.panHandlers : {})} style={styles.dragZone} accessibilityLabel={t('a11y.sheetHandle')}>
              <View style={[styles.handle, { backgroundColor: colors.outline }]} />
            </View>
          )}
          {header}
          <ScrollView style={styles.flexShrink} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? <View style={[styles.footer, { paddingBottom: dialog ? space.s5 : insets.bottom + space.s4 }]}>{footer}</View> : null}
          {!footer && !dialog ? <View style={{ height: insets.bottom }} /> : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  rootDialog: { justifyContent: 'center', alignItems: 'center', padding: space.s6 },
  sheet: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: 'hidden',
  },
  sheetMedium: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  dialog: { borderRadius: radius.sheet, borderWidth: 1, overflow: 'hidden', maxWidth: '100%' },
  dragZone: { height: 24, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 32, height: 4, borderRadius: radius.full },
  head: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.s5, paddingRight: space.s1, minHeight: size.touch, paddingTop: space.s1 },
  close: { width: size.touch, height: size.touch, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: space.s5, paddingBottom: space.s4, gap: space.s3 },
  footer: { paddingHorizontal: space.s5, paddingTop: space.s3, gap: space.s2 },
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
});
