// The five destinations (spec 1.3) as one component in three layouts (DESIGN_SYSTEM.md 5.9, 8.1):
// bottom tabs (compact), rail (medium), sidebar (expanded and large).
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CircleUserRound, MessagesSquare, Vote, Wallet } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontScaleCaps, radius, size, space, useTheme, type Breakpoint } from '@/theme';
import { Touchable } from '../primitives/Touchable';
import { Txt } from '../primitives/Txt';
import { RingMark } from '../brand/RingMark';
import { CountBadge, DotBadge } from '../identity/Badge';

export type TabKey = 'njangi' | 'groupe' | 'caisse' | 'votes' | 'moi';

export interface NavigationProps {
  active: TabKey;
  onSelect: (tab: TabKey) => void;
  layout: 'tabs' | 'rail' | 'sidebar';
  unreadChat: number;
  votesWaiting: number;
  /** A private reply from the agent is waiting (dot on Njangi). */
  agentWaiting: boolean;
  /** Sidebar footer: the member's name. */
  memberName?: string;
}

export function navigationLayoutFor(bp: Breakpoint): NavigationProps['layout'] {
  return bp === 'compact' ? 'tabs' : bp === 'medium' ? 'rail' : 'sidebar';
}

const ORDER: TabKey[] = ['njangi', 'groupe', 'caisse', 'votes', 'moi'];

export function Navigation({ active, onSelect, layout, unreadChat, votesWaiting, agentWaiting, memberName }: NavigationProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const glyph = (key: TabKey, color: string): ReactNode => {
    switch (key) {
      case 'njangi':
        return <RingMark size={24} color={color} />;
      case 'groupe':
        return <MessagesSquare size={24} color={color} strokeWidth={2} />;
      case 'caisse':
        return <Wallet size={24} color={color} strokeWidth={2} />;
      case 'votes':
        return <Vote size={24} color={color} strokeWidth={2} />;
      default:
        return <CircleUserRound size={24} color={color} strokeWidth={2} />;
    }
  };
  const a11y = (key: TabKey): string => {
    if (key === 'groupe' && unreadChat > 0) return t('nav.tabsA11y.groupe', { count: unreadChat });
    if (key === 'votes' && votesWaiting > 0) return t('nav.tabsA11y.votes', { count: votesWaiting });
    return key === 'groupe' ? t('nav.tabs.groupe') : key === 'votes' ? t('nav.tabs.votes') : t(`nav.tabsA11y.${key}`);
  };
  const badge = (key: TabKey): ReactNode =>
    key === 'groupe' ? <CountBadge count={unreadChat} /> : key === 'votes' ? <CountBadge count={votesWaiting} /> : key === 'njangi' && agentWaiting ? <DotBadge /> : null;

  const item = (key: TabKey) => {
    const on = key === active;
    const color = on ? colors.iconActive : colors.iconSecondary;
    const label = (
      <Txt
        variant={layout === 'sidebar' ? (on ? 'bodyStrong' : 'body') : on ? 'captionStrong' : 'caption'}
        maxFontSizeMultiplier={fontScaleCaps.tabLabel}
        numberOfLines={1}
        style={{ color: on ? colors.textLink : colors.textSecondary }}
      >
        {t(`nav.tabs.${key}`)}
      </Txt>
    );
    const common = {
      key,
      onPress: () => onSelect(key),
      accessibilityRole: 'tab' as const,
      accessibilityState: { selected: on },
      accessibilityLabel: a11y(key),
    };
    if (layout === 'sidebar') {
      return (
        <Touchable {...common} style={styles.sideItem} pressedLayer={on ? null : undefined}>
          <View style={[styles.sideRow, on && { backgroundColor: colors.selectedTint }]}>
            {glyph(key, color)}
            <View style={styles.flex}>{label}</View>
            {badge(key)}
          </View>
        </Touchable>
      );
    }
    return (
      <Touchable {...common} style={layout === 'tabs' ? styles.tabItem : styles.railItem} radius={radius.group} pressedLayer={null}>
        <View style={styles.tabInner}>
          <View style={[styles.pill, on && { backgroundColor: colors.selectedTint }]}>
            {glyph(key, color)}
            <View style={styles.badgeSpot}>{badge(key)}</View>
          </View>
          {label}
        </View>
      </Touchable>
    );
  };

  if (layout === 'tabs') {
    return (
      <View accessibilityRole="tablist" accessibilityLabel={t('nav.navigationLabel')} style={[styles.tabs, { borderTopColor: colors.divider, backgroundColor: colors.canvas, paddingBottom: insets.bottom }]}>
        {ORDER.map(item)}
      </View>
    );
  }
  if (layout === 'rail') {
    return (
      <View accessibilityRole="tablist" accessibilityLabel={t('nav.navigationLabel')} style={[styles.rail, { borderRightColor: colors.divider, paddingTop: insets.top + space.s4 }]}>
        {ORDER.map(item)}
      </View>
    );
  }
  return (
    <View accessibilityRole="tablist" accessibilityLabel={t('nav.navigationLabel')} style={[styles.sidebar, { borderRightColor: colors.divider, paddingTop: insets.top + space.s5 }]}>
      <View style={styles.brand}>
        <RingMark size={24} color={colors.iconActive} />
        <Txt variant="groupTitle">{t('common.appName')}</Txt>
      </View>
      {ORDER.map(item)}
      {memberName ? (
        <View style={[styles.me, { borderTopColor: colors.divider }]}>
          <Txt variant="secondaryStrong" numberOfLines={1}>{memberName}</Txt>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderTopWidth: 1, minHeight: size.tabBar },
  tabItem: { flex: 1, minHeight: size.tabBar },
  tabInner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: space.s1 },
  pill: { width: 56, height: 32, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  badgeSpot: { position: 'absolute', top: -4, right: 2 },
  rail: { width: 80, borderRightWidth: 1, alignItems: 'center', gap: space.s2 },
  railItem: { width: 72, minHeight: 64 },
  sidebar: { width: 256, borderRightWidth: 1, paddingHorizontal: space.s3, gap: space.s1 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.s2, paddingHorizontal: space.s3, paddingBottom: space.s5 },
  sideItem: { alignSelf: 'stretch' },
  sideRow: { minHeight: size.touch, borderRadius: radius.group, flexDirection: 'row', alignItems: 'center', gap: space.s3, paddingHorizontal: space.s3 },
  me: { marginTop: 'auto', borderTopWidth: 1, padding: space.s3 },
  flex: { flex: 1 },
});
