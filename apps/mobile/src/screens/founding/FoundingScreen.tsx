// S-08 Founding members and the first cycle (SCREENS.md; GRP-02, R1.1, R1.6): invite directly before
// the first cycle, then start it with at least 3 active members (L1 card).
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Hourglass } from 'lucide-react-native';
import type { PendingActionDto } from '@njangi/shared/contracts/pending-actions';
import { formatDateShort } from '@njangi/shared';
import { radius, space, useTheme } from '@/theme';
import {
  AppHeader,
  Avatar,
  BottomSheet,
  Button,
  GroupedList,
  InfoCard,
  ListRow,
  SectionHeader,
  SkeletonRows,
  Txt,
  useLang,
} from '@/ui';
import { useActiveGroup, useMembers, useStartCycle } from '@/features/groups/useGroups';
import { useGroupInvites } from '@/features/invites/useInvites';
import { errorMessage } from '@/features/errors/errorMessage';
import { ActionCard } from '../shared/ActionCard';
import { Screen } from '../shared/Screen';
import { InviteSheet } from './InviteSheet';

const MIN_MEMBERS = 3;

export function FoundingScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const lang = useLang();
  const router = useRouter();
  const { group } = useActiveGroup();
  const admin = group?.role === 'ADMIN';
  const members = useMembers(group?.groupId ?? null);
  const invites = useGroupInvites(group?.groupId ?? null, admin);
  const start = useStartCycle(group?.groupId ?? null);
  const [inviting, setInviting] = useState(false);
  const [startAction, setStartAction] = useState<PendingActionDto | null>(null);
  // Until the money services exist the server refuses the draw (CYCLE_START_UNAVAILABLE).
  const [soon, setSoon] = useState(false);

  const header = (
    <AppHeader
      kind="pushed"
      title={t('invite.founding.title')}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  );
  if (!group)
    return (
      <Screen header={header}>
        <SkeletonRows rows={4} />
      </Screen>
    );

  const active = (members.data ?? []).filter((m) => m.status === 'ACTIVE');
  const pending = (invites.data ?? []).filter((i) => i.status === 'PENDING');
  const ready = active.length >= MIN_MEMBERS;
  const ratio = Math.min(1, active.length / MIN_MEMBERS);

  return (
    <Screen
      header={header}
      footer={
        admin && group.status === 'FORMING' ? (
          <>
            {start.error ? (
              <Txt variant="secondary" color="textDanger">
                {errorMessage(start.error, t, lang)}
              </Txt>
            ) : null}
            <Button
              fullWidth
              variant="secondary"
              label={t('invite.founding.add')}
              onPress={() => setInviting(true)}
            />
            <Button
              fullWidth
              label={t('startCycle.title')}
              disabled={!ready}
              loading={start.isPending}
              accessibilityHint={
                ready ? undefined : t('startCycle.needMore', { count: MIN_MEMBERS - active.length })
              }
              onPress={() => start.mutate(undefined, { onSuccess: setStartAction })}
            />
          </>
        ) : undefined
      }
    >
      {soon ? (
        <InfoCard
          icon={Hourglass}
          title={t('startCycle.soonTitle')}
          lines={[t('startCycle.soonBody')]}
          actions={[]}
        />
      ) : null}
      <Txt color="textSecondary">{t('invite.founding.body')}</Txt>
      <View
        style={[styles.track, { backgroundColor: colors.surfaceTint }]}
        accessible
        accessibilityLabel={t('invite.founding.progress', { count: active.length })}
      >
        <View
          style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: colors.primary }]}
        />
      </View>
      <Txt variant="secondary">
        {ready
          ? t('invite.founding.ready')
          : t('invite.founding.progress', { count: active.length })}
      </Txt>

      <SectionHeader title={t('members.count', { count: active.length })} />
      {members.isPending ? <SkeletonRows rows={3} /> : null}
      <View style={styles.flush}>
        <GroupedList>
          {active.map((m) => (
            <ListRow
              key={m.membershipId}
              leading={<Avatar name={m.name} />}
              title={m.isMe ? t('common.youSuffix', { name: m.name }) : m.name}
              trailing={
                m.role === 'ADMIN' ? (
                  <Txt variant="captionStrong" color="textSecondary">
                    {t('common.roles.ADMIN')}
                  </Txt>
                ) : undefined
              }
            />
          ))}
        </GroupedList>
      </View>

      {admin && pending.length ? (
        <>
          <SectionHeader title={t('groupSettings.invites')} />
          <View style={styles.flush}>
            <GroupedList>
              {pending.map((i) => (
                <ListRow
                  key={i.id}
                  leading={<Avatar name={i.inviteeName} />}
                  title={i.inviteeName}
                  subtitle={t('invite.founding.statusPending', {
                    date: formatDateShort(i.expiresAt, lang),
                  })}
                />
              ))}
            </GroupedList>
          </View>
        </>
      ) : null}
      {!admin ? (
        <Txt variant="secondary" color="textSecondary">
          {t('groupSettings.memberViewNote')}
        </Txt>
      ) : null}

      {admin ? (
        <InviteSheet
          visible={inviting}
          groupId={group.groupId}
          groupName={group.name}
          onClose={() => {
            setInviting(false);
            void invites.refetch();
          }}
        />
      ) : null}
      <BottomSheet
        visible={!!startAction}
        onClose={() => setStartAction(null)}
        title={t('startCycle.title')}
      >
        <Txt>{t('startCycle.body', { count: active.length })}</Txt>
        {pending.length ? (
          <Txt variant="secondary" color="textSecondary">
            {t('startCycle.pendingInvites', { count: pending.length })}
          </Txt>
        ) : null}
        {startAction ? (
          <ActionCard
            action={startAction}
            onConfirmed={() => {
              setStartAction(null);
              router.replace('/');
            }}
            onCancelled={() => setStartAction(null)}
            onClose={() => setStartAction(null)}
            onError={(code) => {
              if (code !== 'CYCLE_START_UNAVAILABLE') return;
              setStartAction(null);
              setSoon(true);
            }}
          />
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: radius.full, overflow: 'hidden' },
  fill: { height: 8, borderRadius: radius.full },
  flush: { marginHorizontal: -space.s4 },
});
