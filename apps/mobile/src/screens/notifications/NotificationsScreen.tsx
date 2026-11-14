// S-33 Notifications (SCREENS.md; spec 1.8, 2.13): newest first, unread in bold with a dot; tapping
// marks read and opens the deep link. A pending PIN reset on my account offers "Annuler" (D14).
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AlarmClock, Bell, MessagesSquare, Shield, Vote, Wallet } from 'lucide-react-native';
import { formatClock, formatDateShort, pick, toDouala } from '@njangi/shared';
import type { NotificationCategory, NotificationDto } from '@njangi/shared/contracts/notifications';
import { radius, space, useTheme } from '@/theme';
import {
  AppHeader,
  Button,
  DotBadge,
  EmptyState,
  SkeletonRows,
  Touchable,
  Txt,
  useLang,
  type IconComponent,
} from '@/ui';
import { useMarkRead, useNotifications } from '@/features/notifications/useNotifications';
import { PIN_RESET_OWNER_LINK, resolveDeepLink } from '@/features/notifications/deepLinks';
import { useActiveGroup } from '@/features/groups/useGroups';
import { useCancelMyPinReset } from '@/features/pinResets/usePinResets';
import { errorMessage } from '@/features/errors/errorMessage';
import { Screen } from '../shared/Screen';

const ICONS: Record<NotificationCategory, IconComponent> = {
  REMINDERS: AlarmClock,
  MONEY: Wallet,
  VOTES: Vote,
  GROUP: MessagesSquare,
  SECURITY: Shield,
};

/** A pending reset of my own PIN (D14): the deep link the server uses for it. */
const isPinResetAlert = (n: NotificationDto) =>
  n.category === 'SECURITY' && n.deepLink === PIN_RESET_OWNER_LINK;

export function NotificationsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const lang = useLang();
  const router = useRouter();
  const { setGroupId } = useActiveGroup();
  const list = useNotifications();
  const markRead = useMarkRead();
  const cancelReset = useCancelMyPinReset();
  const [today] = useState(() => toDouala(new Date()));
  const items = list.data?.notifications ?? [];
  const isToday = (iso: string) => {
    const d = toDouala(iso);
    return d.year === today.year && d.month === today.month && d.day === today.day;
  };

  const open = (n: NotificationDto) => {
    if (!n.readAt) markRead.mutate({ ids: [n.id] });
    const target = isPinResetAlert(n) ? null : resolveDeepLink(n.deepLink);
    if (!target) return;
    if (target.groupId) setGroupId(target.groupId);
    router.push(target.route);
  };

  return (
    <Screen
      header={
        <AppHeader
          kind="pushed"
          title={t('notifications.title')}
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      }
    >
      {list.data && list.data.unreadCount > 0 ? (
        <View style={styles.right}>
          <Button
            variant="text"
            label={t('notifications.markAllRead')}
            onPress={() => markRead.mutate({ all: true })}
          />
        </View>
      ) : null}
      {list.isPending ? <SkeletonRows rows={4} /> : null}
      {!list.isPending && !items.length ? (
        <EmptyState icon={Bell} title={t('notifications.title')} body={t('notifications.empty')} />
      ) : null}
      <View style={[styles.list, { marginHorizontal: -space.s4 }]}>
        {items.map((n, i) => {
          const Glyph = ICONS[n.category];
          const unread = !n.readAt;
          const when = isToday(n.createdAt)
            ? formatClock(n.createdAt, lang)
            : formatDateShort(n.createdAt, lang);
          return (
            <View key={n.id}>
              <Touchable
                onPress={() => open(n)}
                radius={0}
                accessibilityRole="button"
                accessibilityLabel={`${unread ? `${t('notifications.unread')}, ` : ''}${pick(n.title, lang)}. ${pick(n.body, lang)}. ${when}`}
              >
                <View
                  style={[
                    styles.row,
                    i > 0 && { borderTopWidth: 1, borderTopColor: colors.divider },
                  ]}
                >
                  <View style={[styles.icon, { backgroundColor: colors.surfaceTint }]}>
                    <Glyph
                      size={20}
                      color={n.category === 'SECURITY' ? colors.statusLate : colors.iconPrimary}
                      strokeWidth={2}
                    />
                  </View>
                  <View style={styles.text}>
                    <Txt variant={unread ? 'bodyStrong' : 'body'}>{pick(n.title, lang)}</Txt>
                    <Txt variant="secondary" color="textSecondary" numberOfLines={2}>
                      {pick(n.body, lang)}
                    </Txt>
                  </View>
                  <View style={styles.meta}>
                    <Txt variant="caption" color="textSecondary">
                      {when}
                    </Txt>
                    {unread ? <DotBadge /> : null}
                  </View>
                </View>
              </Touchable>
              {isPinResetAlert(n) ? (
                <View style={styles.reset}>
                  {cancelReset.isSuccess ? (
                    <Txt variant="secondary">{t('pinReset.owner.cancelled')}</Txt>
                  ) : (
                    <>
                      <Txt variant="secondary" color="textSecondary">
                        {t('pinReset.owner.body')}
                      </Txt>
                      <Button
                        variant="destructive"
                        label={t('pinReset.owner.cancel')}
                        loading={cancelReset.isPending}
                        onPress={() =>
                          cancelReset.mutate(undefined, {
                            onSuccess: () => markRead.mutate({ ids: [n.id] }),
                          })
                        }
                      />
                      {cancelReset.error ? (
                        <Txt variant="secondary" color="textDanger">
                          {errorMessage(cancelReset.error, t, lang)}
                        </Txt>
                      ) : null}
                    </>
                  )}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  right: { alignItems: 'flex-end' },
  list: {},
  row: {
    flexDirection: 'row',
    gap: space.s3,
    paddingHorizontal: space.s4,
    paddingVertical: space.s3,
    alignItems: 'flex-start',
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, minWidth: 0 },
  meta: { alignItems: 'flex-end', gap: space.s1 },
  reset: {
    paddingLeft: space.s4 + 40 + space.s3,
    paddingRight: space.s4,
    paddingBottom: space.s3,
    gap: space.s2,
    alignItems: 'flex-start',
  },
});
