// S-28 Members and mini-profile (SCREENS.md; spec 1.2, 2.11): names, roles and status only, never a
// phone number. Reliability shows "Nouveau membre" until the reliability data exists (R14.2).
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CircleAlert } from 'lucide-react-native';
import type { PublicMemberDto } from '@njangi/shared/contracts/groups';
import { formatDateLong } from '@njangi/shared';
import { space } from '@/theme';
import {
  AppHeader,
  Avatar,
  EmptyState,
  GroupedList,
  LabelBadge,
  ListRow,
  MemberProfileSheet,
  SkeletonRows,
  Txt,
  useLang,
} from '@/ui';
import { useActiveGroup, useMembers } from '@/features/groups/useGroups';
import { Screen } from '../shared/Screen';

export function MembersScreen() {
  const { t } = useTranslation();
  const lang = useLang();
  const router = useRouter();
  const { group } = useActiveGroup();
  const members = useMembers(group?.groupId ?? null);
  const [open, setOpen] = useState<number | null>(null);
  const list: PublicMemberDto[] = members.data ?? [];
  const status = (m: PublicMemberDto) => t(`common.membershipStatus.${m.status}`);
  const current = open !== null ? list[open] : undefined;

  return (
    <Screen
      header={
        <AppHeader
          kind="pushed"
          title={t('members.title')}
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      }
    >
      <Txt color="textSecondary">{t('members.count', { count: list.length })}</Txt>
      {members.isPending ? <SkeletonRows rows={5} /> : null}
      {members.isError ? (
        <EmptyState
          icon={CircleAlert}
          title={t('emptyStates.loadFailed.title')}
          body={t('emptyStates.loadFailed.body')}
          actionLabel={t('common.actions.retry')}
          onAction={() => void members.refetch()}
        />
      ) : null}
      {list.length ? (
        <View style={{ marginHorizontal: -space.s4 }}>
          <GroupedList>
            {list.map((m, i) => (
              <ListRow
                key={m.membershipId}
                leading={<Avatar name={m.name} />}
                title={m.isMe ? t('common.youSuffix', { name: m.name }) : m.name}
                subtitle={status(m)}
                trailing={
                  m.role === 'ADMIN' ? <LabelBadge label={t('common.roles.ADMIN')} /> : undefined
                }
                onPress={() => setOpen(i)}
              />
            ))}
          </GroupedList>
        </View>
      ) : null}
      <Txt variant="secondary" color="textSecondary">
        {t('members.noPhones')}
      </Txt>
      <MemberProfileSheet
        visible={!!current}
        onClose={() => setOpen(null)}
        onPrevious={
          list.length > 1
            ? () => setOpen((i) => ((i ?? 0) - 1 + list.length) % list.length)
            : undefined
        }
        onNext={list.length > 1 ? () => setOpen((i) => ((i ?? 0) + 1) % list.length) : undefined}
        profile={
          current
            ? {
                name: current.name,
                isMe: current.isMe,
                isAdmin: current.role === 'ADMIN',
                isBeneficiary: false,
                roundStatus: null,
                turn: null,
                servedRound: null,
                reliability: { score: null, onTime: 0, due: 0, window: 12 },
                memberSince: formatDateLong(current.joinedAt, lang, { withYear: true }),
                leftOn:
                  'leftAt' in current && typeof current.leftAt === 'string'
                    ? formatDateLong(current.leftAt, lang, { withYear: true })
                    : null,
              }
            : null
        }
      />
    </Screen>
  );
}
