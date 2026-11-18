// Page scaffold for every screen (DESIGN_SYSTEM.md 4.2, 8.1, 8.3): canvas, safe areas, an optional
// header, the offline banner, a centred column (forms 480, reading 720) and an optional sticky footer.
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { contentWidth, space, useBreakpoint, useTheme } from '@/theme';
import { useKeyboardOpen } from '@/ui/primitives/useKeyboardOpen';
import { OfflineBanner } from './OfflineBanner';

interface ScreenProps {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  /** `form` 480, `reading` 720, `full` no limit. */
  width?: 'form' | 'reading' | 'full';
  /** False for screens that manage their own scrolling (lists, chat). */
  scroll?: boolean;
  /** Tab screens sit above the tab bar, which handles the bottom inset. */
  inTabs?: boolean;
}

export function Screen({
  children,
  header,
  footer,
  width = 'reading',
  scroll = true,
  inTabs = false,
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { gutter, isCompact } = useBreakpoint();
  const max =
    width === 'form' ? contentWidth.form : width === 'reading' ? contentWidth.reading : undefined;
  const column = [
    styles.column,
    max ? { maxWidth: max } : null,
    { paddingHorizontal: width === 'full' ? 0 : gutter },
  ];
  const keyboardOpen = useKeyboardOpen();
  // With the keyboard up, the screen already ends above the keys: no gesture-bar space under the
  // sticky footer (it showed as a white band between the field and the keyboard).
  const bottom = keyboardOpen
    ? space.s2
    : inTabs && isCompact
      ? space.s4
      : insets.bottom + space.s4;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { backgroundColor: colors.canvas, paddingTop: insets.top }]}
    >
      {header}
      <OfflineBanner />
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scroll, { paddingBottom: footer ? space.s4 : bottom }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={column}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[styles.flex, column]}>{children}</View>
      )}
      {footer ? (
        <View style={[styles.footer, { paddingBottom: bottom, borderTopColor: colors.divider }]}>
          <View style={[column, styles.footerInner]}>{footer}</View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingTop: space.s2 },
  column: { width: '100%', alignSelf: 'center', gap: space.s4 },
  footer: { borderTopWidth: 1, paddingTop: space.s3 },
  footerInner: { gap: space.s2 },
});
