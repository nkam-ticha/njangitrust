// Developer console, one group (D28): status, members with full numbers, what is still running.
// "Close group" asks for the name to be typed first. A closed group disappears for its members; the
// ledger is kept. The API refuses with a clear reason while a payment or send is in flight.
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CircleAlert } from 'lucide-react-native';
import { formatDateTime } from '@njangi/shared';
import { space } from '@/theme';
import {
  AppHeader,
  Avatar,
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
import { useCloseDeveloperGroup, useDeveloperGroup } from '@/features/developer/useDeveloper';
import { errorMessage } from '@/features/errors/errorMessage';
import { Screen } from '../shared/Screen';
import { TypeNameSheet } from './TypeNameSheet';

const IN_FLIGHT_KEYS = [
  'openPayments',
  'openDisbursements',
  'approvedPayouts',
  'openVotes',
  'pendingActions',
] as const;

export function GroupDetailScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const lang = useLang();
  const router = useRouter();
  const query = useDeveloperGroup(id);
  const close = useCloseDeveloperGroup(id);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const group = query.data;
  const when = (instant: string) => formatDateTime(instant, lang, { withYear: true });
  // D28: a group whose members still hold money cannot be closed; the API refuses with the reason.
  const holdsMoney =
    !!group &&
    !group.hidden &&
    group.heldMoney.obligations + group.heldMoney.loans + group.heldMoney.balances > 0;
  const running = group ? IN_FLIGHT_KEYS.filter((key) => group.inFlight[key] > 0) : [];

  return (
    <Screen
      header={
        <AppHeader
          kind="pushed"
          title={group?.name ?? t('developer.group.title')}
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/developer'))}
        />
      }
    >
      {done ? <Banner kind="info" text={t('developer.close.done')} /> : null}
      {holdsMoney ? (
        <Banner
          kind="info"
          text={`${t('developer.group.holdsMoney')} ${t('developer.group.holdsMoneyCounts', { ...group.heldMoney })}`}
        />
      ) : null}
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
      {group ? (
        <View style={{ marginHorizontal: -space.s4 }}>
          <GroupedList>
            <ListRow
              title={t(`developer.group.statuses.${group.status}`)}
              subtitle={
                group.hiddenAt
                  ? t('developer.group.hiddenAt', { date: when(group.hiddenAt) })
                  : undefined
              }
              trailingNote={
                group.hidden ? <LabelBadge label={t('developer.groups.hidden')} /> : undefined
              }
            />
            <ListRow
              title={t('developer.groups.members', { count: group.memberCount })}
              subtitle={
                group.cycle
                  ? group.cycle.currentRound
                    ? t('developer.groups.cycle', {
                        cycle: group.cycle.number,
                        round: group.cycle.currentRound.number,
                        total: group.cycle.roundCount,
                      })
                    : t('developer.groups.cycleNoRound', {
                        cycle: group.cycle.number,
                        total: group.cycle.roundCount,
                      })
                  : t('developer.groups.noCycle')
              }
            />
            <ListRow
              title={t('developer.group.createdBy', { name: group.createdByName })}
              subtitle={t('developer.group.createdAt', { date: when(group.createdAt) })}
            />
            <ListRow
              title={t('developer.group.firstPayout', { date: when(group.firstPayoutAt) })}
              titleWeight="regular"
            />
          </GroupedList>

          <SectionHeader title={t('developer.group.inFlight')} />
          {running.length === 0 ? (
            <ListRow title={t('developer.group.inFlightNone')} titleWeight="regular" />
          ) : (
            <GroupedList>
              {running.map((key) => (
                <ListRow
                  key={key}
                  title={t(`developer.group.${key}`)}
                  trailing={<LabelBadge label={String(group.inFlight[key])} />}
                />
              ))}
            </GroupedList>
          )}

          <SectionHeader title={`${t('developer.group.members')} (${group.members.length})`} />
          <GroupedList>
            {group.members.map((member) => (
              <ListRow
                key={member.membershipId}
                leading={<Avatar name={member.name} />}
                title={member.name}
                subtitle={[
                  member.phone ?? t('developer.user.noPhone'),
                  t(`common.roles.${member.role}`),
                  t(`common.membershipStatus.${member.status}`),
                ].join(' · ')}
                chevron
                onPress={() => router.push(`/developer/user/${member.userId}`)}
              />
            ))}
          </GroupedList>

          {!group.hidden ? (
            <View style={{ paddingHorizontal: space.s4, paddingTop: space.s6 }}>
              <Button
                fullWidth
                variant="destructive"
                label={t('developer.close.button')}
                onPress={() => {
                  close.reset();
                  setConfirming(true);
                }}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {group ? (
        <TypeNameSheet
          visible={confirming}
          onClose={() => setConfirming(false)}
          title={t('developer.close.title')}
          body={t('developer.close.body', { name: group.name, count: group.memberCount })}
          prompt={t('developer.close.typeName', { name: group.name })}
          fieldLabel={t('developer.close.nameLabel')}
          name={group.name}
          confirmLabel={t('developer.close.confirm')}
          pending={close.isPending}
          error={close.error}
          onConfirm={async () => {
            await close.mutateAsync();
            setConfirming(false);
            setDone(true);
          }}
        />
      ) : null}
    </Screen>
  );
}
