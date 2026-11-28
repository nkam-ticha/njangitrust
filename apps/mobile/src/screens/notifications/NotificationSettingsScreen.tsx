// S-34 Notification settings (SCREENS.md; spec 1.8, FSD NOT-03): what the member is told, quiet hours
// (21:00 to 07:00 Douala by default; security alerts always get through), chat mute per group, the
// media download setting, and on a phone the push permission and this phone's token.
import { Children, useEffect, type ReactNode } from 'react';
import { AppState, Linking, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CircleAlert, CircleCheck } from 'lucide-react-native';
import type { NotificationPrefsDto } from '@njangi/shared/contracts/notifications';
import { radius, space, useTheme } from '@/theme';
import {
  AppHeader,
  Banner,
  Button,
  ChoiceRow,
  EmptyState,
  SectionHeader,
  SkeletonRows,
  SwitchRow,
  TimeField,
  Txt,
  useLang,
} from '@/ui';
import { useConnectivity } from '@/state/connectivity';
import { useActiveGroup } from '@/features/groups/useGroups';
import { errorMessage } from '@/features/errors/errorMessage';
import {
  MUTABLE_CATEGORIES,
  quietHoursAfterToggle,
  quietHoursOn,
  withCategory,
  withMutedGroup,
} from '@/features/notifications/prefsLogic';
import {
  useNotificationPrefs,
  useUpdateNotificationPrefs,
} from '@/features/notifications/useNotificationPrefs';
import { syncPush, usePushStatus } from '@/features/notifications/usePush';
import { Screen } from '../shared/Screen';

const MEDIA_CHOICES: readonly NotificationPrefsDto['mediaAutoDownload'][] = [
  'WIFI_ONLY',
  'ALWAYS',
  'NEVER',
];

/** Rows in one bordered block, a thin divider between them (a switch row is not a ListRow). */
function Block({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.block, { borderColor: colors.divider }]}>
      {Children.toArray(children).map((child, i) => (
        <View key={i} style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.divider } : null}>
          {child}
        </View>
      ))}
    </View>
  );
}

export function NotificationSettingsScreen() {
  const { t } = useTranslation();
  const lang = useLang();
  const router = useRouter();
  const { colors } = useTheme();
  const online = useConnectivity((s) => s.online);
  const prefs = useNotificationPrefs();
  const update = useUpdateNotificationPrefs();
  const { groups } = useActiveGroup();
  const push = usePushStatus();
  const liveGroups = groups.filter(
    (g) => g.membershipStatus !== 'LEFT' && g.membershipStatus !== 'REMOVED',
  );

  // The status is read when the screen opens and again when the member comes back from the phone's
  // settings, where the permission may have changed.
  useEffect(() => {
    void syncPush({ ask: false });
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncPush({ ask: false });
    });
    return () => sub.remove();
  }, []);

  const data = prefs.data;
  const save = (change: Parameters<typeof update.mutate>[0]) => update.mutate(change);

  return (
    <Screen
      width="form"
      header={
        <AppHeader
          kind="pushed"
          title={t('notifications.settings.title')}
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      }
    >
      {prefs.isPending ? <SkeletonRows rows={6} /> : null}
      {prefs.isError ? (
        <EmptyState
          icon={CircleAlert}
          title={t('emptyStates.loadFailed.title')}
          body={errorMessage(prefs.error, t, lang)}
          actionLabel={t('common.actions.retry')}
          onAction={() => void prefs.refetch()}
        />
      ) : null}

      {push.status === 'web' ? (
        <Txt variant="secondary" color="textSecondary">
          {t('notifications.settings.webNote')}
        </Txt>
      ) : null}
      {push.status === 'expoGo' ? (
        <Banner kind="info" text={t('notifications.settings.push.expoGo')} />
      ) : null}
      {push.status === 'denied' ? (
        <>
          <Banner kind="info" text={t('notifications.settings.pushOff')} />
          <Button
            variant="secondary"
            fullWidth
            label={t('notifications.settings.push.openSettings')}
            onPress={() => void Linking.openSettings().catch(() => undefined)}
          />
        </>
      ) : null}
      {push.status === 'undetermined' || push.status === 'failed' ? (
        <View style={styles.push}>
          <Txt variant="secondary" color="textSecondary">
            {push.status === 'failed'
              ? t('notifications.settings.push.failed')
              : t('notifications.settings.push.explain')}
          </Txt>
          <Button
            fullWidth
            label={t('notifications.settings.push.enable')}
            loading={push.busy}
            offline={!online}
            onPress={() => syncPush({ ask: true })}
          />
        </View>
      ) : null}
      {push.status === 'registered' ? (
        <View style={styles.status} accessibilityRole="text">
          <CircleCheck size={20} color={colors.statusPaid} strokeWidth={2} />
          <Txt variant="secondary" style={styles.flex}>
            {t('notifications.settings.push.on')}
          </Txt>
        </View>
      ) : null}

      {data ? (
        <>
          <View>
            <SectionHeader inset={false} title={t('notifications.settings.categoriesTitle')} />
            <Block>
              {MUTABLE_CATEGORIES.map((category) => (
                <SwitchRow
                  key={category}
                  label={t(`notifications.categories.${category}`)}
                  helper={t(`notifications.categoryHelp.${category}`)}
                  value={!data.mutedCategories.includes(category)}
                  onChange={(on) =>
                    save({ mutedCategories: withCategory(data.mutedCategories, category, on) })
                  }
                />
              ))}
              <SwitchRow
                label={t('notifications.categories.SECURITY')}
                helper={`${t('notifications.categoryHelp.SECURITY')} ${t('notifications.settings.securityLocked')}`}
                value
                disabled
              />
            </Block>
          </View>

          <View style={styles.section}>
            <SectionHeader inset={false} title={t('notifications.settings.quietHours')} />
            <Block>
              <SwitchRow
                label={t('notifications.settings.quietHours')}
                helper={
                  quietHoursOn(data.quietHours)
                    ? t('notifications.settings.quietHoursHelp', {
                        from: data.quietHours.from,
                        to: data.quietHours.to,
                      })
                    : t('notifications.settings.quietHoursOff')
                }
                value={quietHoursOn(data.quietHours)}
                onChange={(on) => save({ quietHours: quietHoursAfterToggle(data.quietHours, on) })}
              />
            </Block>
            {quietHoursOn(data.quietHours) ? (
              <View style={styles.times}>
                <TimeField
                  label={t('notifications.settings.from')}
                  value={data.quietHours.from}
                  onChange={(from) => save({ quietHours: { ...data.quietHours, from } })}
                />
                <TimeField
                  label={t('notifications.settings.to')}
                  value={data.quietHours.to}
                  onChange={(to) => save({ quietHours: { ...data.quietHours, to } })}
                />
              </View>
            ) : null}
          </View>

          <View style={styles.section}>
            <SectionHeader inset={false} title={t('notifications.settings.muteChat')} />
            <Txt variant="secondary" color="textSecondary" style={styles.help}>
              {t('notifications.settings.muteChatHelp')}
            </Txt>
            {liveGroups.length ? (
              <Block>
                {liveGroups.map((g) => (
                  <SwitchRow
                    key={g.groupId}
                    label={g.name}
                    value={data.mutedChatGroupIds.includes(g.groupId)}
                    onChange={(muted) =>
                      save({
                        mutedChatGroupIds: withMutedGroup(data.mutedChatGroupIds, g.groupId, muted),
                      })
                    }
                  />
                ))}
              </Block>
            ) : (
              <Txt variant="secondary" color="textSecondary">
                {t('emptyStates.noGroup.body')}
              </Txt>
            )}
          </View>

          <View style={styles.section}>
            <SectionHeader inset={false} title={t('notifications.settings.mediaTitle')} />
            <Txt variant="secondary" color="textSecondary" style={styles.help}>
              {t('notifications.settings.mediaHelp')}
            </Txt>
            <View style={styles.choices}>
              {MEDIA_CHOICES.map((choice) => (
                <ChoiceRow
                  key={choice}
                  label={t(`notifications.settings.mediaChoice.${choice}`)}
                  selected={data.mediaAutoDownload === choice}
                  onPress={() => save({ mediaAutoDownload: choice })}
                />
              ))}
            </View>
          </View>
        </>
      ) : null}

      {update.isError ? (
        <Txt variant="secondary" color="textDanger" accessibilityLiveRegion="assertive">
          {errorMessage(update.error, t, lang)}
        </Txt>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { borderWidth: 1, borderRadius: radius.group, overflow: 'hidden' },
  section: { gap: 0 },
  push: { gap: space.s3 },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  flex: { flex: 1 },
  times: { gap: space.s3, paddingTop: space.s3 },
  help: { paddingBottom: space.s2 },
  choices: { gap: space.s2 },
});
