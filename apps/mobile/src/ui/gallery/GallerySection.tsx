// Gallery layout helpers (development only). Section titles are component names, not app copy.
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { space, useTheme } from '@/theme';
import { Txt } from '../primitives/Txt';

export function GallerySection({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.section, { borderTopColor: colors.divider }]}>
      <Txt variant="screenTitle" accessibilityRole="header" style={styles.title}>
        {title}
      </Txt>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

/** A labelled specimen: the state name above the component. */
export function Specimen({
  label,
  children,
  padded = true,
}: {
  label: string;
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <View style={styles.specimen}>
      <Txt variant="captionStrong" color="textSecondary" style={styles.label}>
        {label}
      </Txt>
      <View style={padded ? styles.padded : null}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { borderTopWidth: 1, paddingTop: space.s6, paddingBottom: space.s4, gap: space.s3 },
  title: { paddingHorizontal: space.s4 },
  body: { gap: space.s5 },
  specimen: { gap: space.s2 },
  label: { paddingHorizontal: space.s4 },
  padded: { paddingHorizontal: space.s4, alignItems: 'flex-start', gap: space.s2 },
});
