// Segmented control (DESIGN_SYSTEM.md 5.7): Tour | Caisse | Secours | Registre.
// Selection moves without animation. When the labels don't fit, the row scrolls.
import { useState } from 'react';
import { ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { radius, space, useTheme } from '@/theme';
import { Touchable } from '../primitives/Touchable';
import { Txt } from '../primitives/Txt';

export interface Segment<K extends string> {
  key: K;
  label: string;
}

interface SegmentedControlProps<K extends string> {
  segments: Segment<K>[];
  value: K;
  onChange: (key: K) => void;
  accessibilityLabel?: string;
}

export function SegmentedControl<K extends string>({ segments, value, onChange, accessibilityLabel }: SegmentedControlProps<K>) {
  const { colors } = useTheme();
  const [overflow, setOverflow] = useState(false);
  const [boxWidth, setBoxWidth] = useState(0);

  const items = segments.map((s) => {
    const on = s.key === value;
    return (
      <Touchable
        key={s.key}
        onPress={() => onChange(s.key)}
        radius={radius.full}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        accessibilityLabel={s.label}
        pressedLayer={on ? null : undefined}
        style={overflow ? styles.itemScroll : styles.item}
      >
        <View style={[styles.seg, on && { backgroundColor: colors.primary }]}>
          <Txt
            variant="secondaryStrong"
            numberOfLines={1}
            onTextLayout={(e) => {
              if (!overflow && boxWidth && e.nativeEvent.lines.length > 1) setOverflow(true);
            }}
            style={{ color: on ? colors.textOnPrimary : colors.textPrimary }}
          >
            {s.label}
          </Txt>
        </View>
      </Touchable>
    );
  });

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e: LayoutChangeEvent) => setBoxWidth(e.nativeEvent.layout.width)}
      style={[styles.box, { backgroundColor: colors.surfaceTint }]}
    >
      {overflow ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {items}
        </ScrollView>
      ) : (
        items
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { minHeight: 48, borderRadius: radius.full, padding: 4, flexDirection: 'row', marginHorizontal: space.s4 },
  item: { flex: 1 },
  itemScroll: {},
  scroll: { gap: 2 },
  seg: { minHeight: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.s3 },
});
