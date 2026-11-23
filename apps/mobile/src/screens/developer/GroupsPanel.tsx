// Developer console, Groups tab (D28): search, filter by status, page, open one group.
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CircleAlert, UsersRound } from 'lucide-react-native';
import type { DeveloperGroupRow } from '@njangi/shared/contracts/developer';
import { space } from '@/theme';
import {
  Chip,
  ChipRow,
  EmptyState,
  GroupedList,
  ListRow,
  SkeletonRows,
  TextField,
  Txt,
  useLang,
} from '@/ui';
import { PAGE_SIZE, useDeveloperGroups, type GroupFilter } from '@/features/developer/useDeveloper';
import { errorMessage } from '@/features/errors/errorMessage';
import { Pager } from './Pager';
import { useDebouncedValue } from './useDebouncedValue';

const FILTERS: { key: GroupFilter; label: string }[] = [
  { key: 'all', label: 'all' },
  { key: 'FORMING', label: 'forming' },
  { key: 'ACTIVE', label: 'running' },
  { key: 'CLOSED', label: 'closed' },
];

export function GroupsPanel() {
  const { t } = useTranslation();
  const lang = useLang();
  const router = useRouter();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<GroupFilter>('all');
  const [page, setPage] = useState(1);
  const q = useDebouncedValue(text.trim());
  const groups = useDeveloperGroups({ q, status, page });
  const data = groups.data;

  const cycleLine = (group: DeveloperGroupRow): string => {
    if (!group.cycle) return t('developer.groups.noCycle');
    return group.cycle.currentRound
      ? t('developer.groups.cycle', {
          cycle: group.cycle.number,
          round: group.cycle.currentRound.number,
          total: group.cycle.roundCount,
        })
      : t('developer.groups.cycleNoRound', {
          cycle: group.cycle.number,
          total: group.cycle.roundCount,
        });
  };

  return (
    <View style={{ gap: space.s3 }}>
      <TextField
        label={t('developer.list.searchGroups')}
        value={text}
        onChangeText={(value) => {
          setText(value);
          setPage(1);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      <View style={{ marginHorizontal: -space.s4 }}>
        <ChipRow>
          {FILTERS.map(({ key, label }) => (
            <Chip
              key={key}
              kind="filter"
              label={t(`developer.filters.${label}` as 'developer.filters.all')}
              selected={status === key}
              onPress={() => {
                setStatus(key);
                setPage(1);
              }}
            />
          ))}
        </ChipRow>
      </View>
      {data ? (
        <Txt color="textSecondary">{t('developer.groups.count', { count: data.total })}</Txt>
      ) : null}
      {groups.isPending ? <SkeletonRows rows={6} /> : null}
      {groups.isError ? (
        <EmptyState
          icon={CircleAlert}
          title={t('emptyStates.loadFailed.title')}
          body={errorMessage(groups.error, t, lang)}
          actionLabel={t('common.actions.retry')}
          onAction={() => void groups.refetch()}
        />
      ) : null}
      {data && data.items.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title={t('developer.list.emptyGroups.title')}
          body={t('developer.list.emptyGroups.body')}
        />
      ) : null}
      {data && data.items.length > 0 ? (
        <View style={{ marginHorizontal: -space.s4 }}>
          <GroupedList>
            {data.items.map((group) => {
              const status = group.hidden
                ? t('developer.groups.hidden')
                : t(`developer.group.statuses.${group.status}`);
              // Status and size on the first line, the cycle on the second: the name keeps the width.
              const first = [
                status,
                t('developer.groups.members', { count: group.memberCount }),
              ].join(' · ');
              const second = cycleLine(group);
              return (
                <ListRow
                  key={group.id}
                  title={group.name}
                  subtitle={`${first}\n${second}`}
                  accessibilityLabel={`${group.name}, ${first}, ${second}`}
                  chevron
                  onPress={() => router.push(`/developer/group/${group.id}`)}
                />
              );
            })}
          </GroupedList>
        </View>
      ) : null}
      {data ? (
        <Pager page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
      ) : null}
    </View>
  );
}
