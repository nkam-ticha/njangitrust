// Grouped list (DESIGN_SYSTEM.md 5.3): rows in a container with radius 12 and a 1 px
// border, no fill. Dividers between rows are added here.
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, space, useTheme } from '@/theme';
import type { ListRowProps } from './ListRow';

interface GroupedListProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function GroupedList({ children, style }: GroupedListProps) {
  const { colors } = useTheme();
  const rows = Children.toArray(children).filter(isValidElement) as ReactElement<ListRowProps>[];
  return (
    <View style={[styles.box, { borderColor: colors.divider }, style]}>
      {rows.map((row, i) => cloneElement(row, { divider: i > 0 }))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: radius.group, overflow: 'hidden', marginHorizontal: space.s4 },
});
