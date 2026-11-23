// Developer console, one account in full (D28): identity with the full phone number, payment
// numbers, devices, logins, and every group with the person's role. "Delete account" asks for the
// name to be typed first; the API refuses with a clear reason when money or a duty is in the way.
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CircleAlert } from 'lucide-react-native';
import { formatDateTime } from '@njangi/shared';
import { space } from '@/theme';
import {
  AppHeader,
  Banner,
  Button,
  EmptyState,
  GroupedList,
  LabelBadge,
  ListRow,
  SectionHeader,
  SkeletonRows,
  useLang,
} from '@/ui';
import { useDeleteDeveloperUser, useDeveloperUser } from '@/features/developer/useDeveloper';
import { errorMessage } from '@/features/errors/errorMessage';
import { Screen } from '../shared/Screen';
import { TypeNameSheet } from './TypeNameSheet';

export function UserDetailScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const lang = useLang();
  const router = useRouter();
  const query = useDeveloperUser(id);
  const remove = useDeleteDeveloperUser(id);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const user = query.data;
  const when = (instant: string) => formatDateTime(instant, lang, { withYear: true });
  // The account deletion refuses an admin and a member of a running cycle: closing the group first lifts both.
  const blockedByGroup =
    user?.status === 'ACTIVE' &&
    user.memberships.some(
      (m) =>
        m.groupStatus !== 'CLOSED' &&
        ['ACTIVE', 'LEAVING'].includes(m.status) &&
        (m.role === 'ADMIN' || m.groupStatus === 'ACTIVE'),
    );

  return (
    <Screen
      header={
        <AppHeader
          kind="pushed"
          title={user?.name ?? t('developer.user.title')}
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/developer'))}
        />
      }
    >
      {done ? <Banner kind="info" text={t('developer.delete.done')} /> : null}
      {blockedByGroup ? <Banner kind="info" text={t('developer.delete.blockedHint')} /> : null}
      {query.isPending ? <SkeletonRows rows={6} /> : null}
      {query.isError ? (
        <EmptyState
          icon={CircleAlert}
          title={t('emptyStates.loadFailed.title')}
          body={errorMessage(query.error, t, lang)}
          actionLabel={t('common.actions.retry')}
          onAction={() => void query.refetch()}
        />
      ) : null}
      {user ? (
        <View style={{ marginHorizontal: -space.s4 }}>
          <SectionHeader title={t('developer.user.identity')} />
          <GroupedList>
            <ListRow
              title={user.phone ?? t('developer.user.noPhone')}
              subtitle={t('developer.user.phone')}
            />
            <ListRow
              title={t(`language.${user.language}`)}
              subtitle={t('developer.user.language')}
            />
            <ListRow
              title={
                user.status === 'ACTIVE'
                  ? t('developer.user.statusActive')
                  : t('developer.user.statusDeleted')
              }
              subtitle={t('developer.user.status')}
            />
            <ListRow title={when(user.createdAt)} subtitle={t('developer.user.createdAt')} />
            <ListRow
              title={user.lastLoginAt ? when(user.lastLoginAt) : t('developer.users.neverLoggedIn')}
              subtitle={t('developer.user.lastLogin')}
            />
            {user.deletedAt ? (
              <ListRow title={when(user.deletedAt)} subtitle={t('developer.user.deletedAt')} />
            ) : null}
            <ListRow
              title={`${user.consentVersion} · ${when(user.consentAt)}`}
              subtitle={t('developer.user.consent')}
            />
            {user.pinChangedAt ? (
              <ListRow
                title={when(user.pinChangedAt)}
                subtitle={t('developer.user.pinChangedAt')}
              />
            ) : null}
          </GroupedList>

          <SectionHeader title={t('developer.user.paymentNumbers')} />
          {user.paymentNumbers.length === 0 ? (
            <ListRow title={t('developer.user.noNumbers')} titleWeight="regular" />
          ) : (
            <GroupedList>
              {user.paymentNumbers.map((n) => (
                <ListRow
                  key={`${n.number}-${n.activeFrom}`}
                  title={n.number}
                  subtitle={`${t(`common.operators.${n.operator}` as 'common.operators.MTN')} · ${
                    n.activeTo
                      ? t('developer.user.replacedOn', { date: when(n.activeTo) })
                      : t('developer.user.since', { date: when(n.activeFrom) })
                  }`}
                  trailingNote={
                    n.activeTo ? undefined : <LabelBadge label={t('developer.user.current')} />
                  }
                />
              ))}
            </GroupedList>
          )}

          <SectionHeader title={t('developer.user.devices')} />
          {user.devices.length === 0 ? (
            <ListRow title={t('developer.user.noDevices')} titleWeight="regular" />
          ) : (
            <GroupedList>
              {user.devices.map((device) => (
                <ListRow
                  key={device.id}
                  title={t(`developer.user.platforms.${device.platform}`)}
                  subtitle={[
                    t('developer.user.lastSeen', { date: when(device.lastSeenAt) }),
                    device.hasPushToken ? t('developer.user.pushOn') : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  trailingNote={
                    device.revoked ? <LabelBadge label={t('developer.user.revoked')} /> : undefined
                  }
                />
              ))}
            </GroupedList>
          )}

          <SectionHeader title={t('developer.user.logins')} />
          {user.logins.length === 0 ? (
            <ListRow title={t('developer.user.noLogins')} titleWeight="regular" />
          ) : (
            <GroupedList>
              {user.logins.map((login) => (
                <ListRow
                  key={login.sessionId}
                  title={t('developer.user.loggedInAt', { date: when(login.loggedInAt) })}
                  subtitle={[
                    t(`developer.user.clients.${login.client}`),
                    t('developer.user.lastSeen', { date: when(login.lastActiveAt) }),
                  ].join(' · ')}
                  trailingNote={
                    <LabelBadge
                      label={
                        login.open
                          ? t('developer.user.sessionOpen')
                          : t('developer.user.sessionClosed')
                      }
                    />
                  }
                />
              ))}
            </GroupedList>
          )}

          <SectionHeader title={t('developer.user.groups')} />
          {user.memberships.length === 0 ? (
            <ListRow title={t('developer.user.noGroups')} titleWeight="regular" />
          ) : (
            <GroupedList>
              {user.memberships.map((m) => (
                <ListRow
                  key={m.groupId}
                  title={m.groupName}
                  subtitle={[
                    t(`common.roles.${m.role}`),
                    t(`common.membershipStatus.${m.status}`),
                    t(`developer.group.statuses.${m.groupStatus}`),
                    m.groupHidden ? t('developer.user.hiddenGroup') : null,
                    t('developer.user.joinedOn', { date: when(m.joinedAt) }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  chevron
                  onPress={() => router.push(`/developer/group/${m.groupId}`)}
                />
              ))}
            </GroupedList>
          )}

          {user.status === 'ACTIVE' ? (
            <View style={{ paddingHorizontal: space.s4, paddingTop: space.s6 }}>
              <Button
                fullWidth
                variant="destructive"
                label={t('developer.delete.button')}
                onPress={() => {
                  remove.reset();
                  setConfirming(true);
                }}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {user ? (
        <TypeNameSheet
          visible={confirming}
          onClose={() => setConfirming(false)}
          title={t('developer.delete.title')}
          body={t('developer.delete.body', { name: user.name })}
          prompt={t('developer.delete.typeName', { name: user.name })}
          fieldLabel={t('developer.delete.nameLabel')}
          name={user.name}
          confirmLabel={t('developer.delete.confirm')}
          pending={remove.isPending}
          error={remove.error}
          onConfirm={async () => {
            await remove.mutateAsync();
            setConfirming(false);
            setDone(true);
          }}
        />
      ) : null}
    </Screen>
  );
}
