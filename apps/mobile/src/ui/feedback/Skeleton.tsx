// Static skeleton (DESIGN_SYSTEM.md 5.16, DD-21): no shimmer, shown only after 300 ms on a first
// load without cache, matching the real layout. Read as one "Chargement du contenu".
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { radius, size, space, useTheme } from '@/theme';

interface SkeletonRowsProps {
  rows?: number;
  /** Delay before showing, so fast loads never flash. */
  delayMs?: number;
}

export function SkeletonRows({ rows = 5, delayMs = 300 }: SkeletonRowsProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [shown, setShown] = useState(delayMs === 0);
  useEffect(() => {
    if (delayMs === 0) return;
    const id = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(id);
  }, [delayMs]);
  if (!shown) return null;
  return (
    <View accessible accessibilityLabel={t('a11y.skeleton')} accessibilityState={{ busy: true }}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.row}>
          <View style={[styles.circle, { backgroundColor: colors.surfaceTint }]} />
          <View style={styles.lines}>
            <View style={[styles.bar, { width: '62%', height: 12, backgroundColor: colors.surfaceTint }]} />
            <View style={[styles.bar, { width: '38%', height: 10, backgroundColor: colors.surfaceTint }]} />
          </View>
          <View style={[styles.bar, { width: 64, height: 12, backgroundColor: colors.surfaceTint }]} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: size.rowMin, flexDirection: 'row', alignItems: 'center', gap: space.s3, paddingHorizontal: space.s4 },
  circle: { width: size.avatar, height: size.avatar, borderRadius: radius.full },
  lines: { flex: 1, gap: space.s2 },
  bar: { borderRadius: radius.full },
});
