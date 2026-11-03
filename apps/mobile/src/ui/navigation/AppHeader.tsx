// Header (DESIGN_SYSTEM.md 5.8): group switcher and bell on tab screens; back and title on
// pushed screens. Same component and place at every width (DD-27).
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Bell, ChevronDown } from 'lucide-react-native';
import { size, space, useTheme } from '@/theme';
import { Touchable } from '../primitives/Touchable';
import { Txt } from '../primitives/Txt';
import { CountBadge } from '../identity/Badge';

type AppHeaderProps =
  | {
      kind: 'tab';
      groupName: string;
      unreadNotifications: number;
      onSwitchGroup: () => void;
      onOpenNotifications: () => void;
    }
  | { kind: 'pushed'; title: string; onBack: () => void };

export function AppHeader(props: AppHeaderProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  if (props.kind === 'pushed') {
    return (
      <View style={[styles.bar, styles.pushed]}>
        <Touchable onPress={props.onBack} radius={24} accessibilityRole="button" accessibilityLabel={t('nav.back')} style={styles.iconBtn}>
          <ArrowLeft size={24} color={colors.iconPrimary} strokeWidth={2} />
        </Touchable>
        <Txt variant="screenTitle" numberOfLines={2} accessibilityRole="header" style={styles.flex}>
          {props.title}
        </Txt>
      </View>
    );
  }

  const bellLabel = props.unreadNotifications > 0 ? t('nav.bell.labelUnread', { count: props.unreadNotifications }) : t('nav.bell.label');
  return (
    <View style={[styles.bar, styles.tab]}>
      <Touchable
        onPress={props.onSwitchGroup}
        accessibilityRole="button"
        accessibilityLabel={t('nav.groupSwitcher.a11yLabel', { name: props.groupName })}
        style={styles.flexShrink}
      >
        <View style={styles.switcher}>
          <Txt variant="groupTitle" numberOfLines={2} style={styles.flexShrink}>{props.groupName}</Txt>
          <ChevronDown size={20} color={colors.iconSecondary} strokeWidth={2} />
        </View>
      </Touchable>
      <Touchable onPress={props.onOpenNotifications} radius={24} accessibilityRole="button" accessibilityLabel={bellLabel} style={styles.iconBtn}>
        <Bell size={24} color={colors.iconPrimary} strokeWidth={2} />
        <CountBadge count={props.unreadNotifications} style={styles.badge} />
      </Touchable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { minHeight: size.header, flexDirection: 'row', alignItems: 'center' },
  tab: { justifyContent: 'space-between', paddingLeft: space.s4, paddingRight: space.s1, gap: space.s2 },
  pushed: { paddingHorizontal: space.s1, gap: space.s1 },
  switcher: { minHeight: size.touch, flexDirection: 'row', alignItems: 'center', gap: space.s1 },
  iconBtn: { width: size.touch, height: size.touch, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 6, right: 4 },
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
});
