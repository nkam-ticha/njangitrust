// Developer console, Users tab (D28): search by name or number, filter, page, open one account.
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CircleAlert, Users } from 'lucide-react-native';
import { formatDateTime } from '@njangi/shared';
import { space } from '@/theme';
import {
  Avatar,
  Chip,
  ChipRow,
  EmptyState,
  GroupedList,
  LabelBadge,
  ListRow,
  SkeletonRows,
  TextField,
  Txt,
  useLang,
} from '@/ui';
import { PAGE_SIZE, useDeveloperUsers, type UserFilter } from '@/features/developer/useDeveloper';
import { errorMessage } from '@/features/errors/errorMessage';
import { Pager } from './Pager';
import { useDebouncedValue } from './useDebouncedValue';

const FILTERS: UserFilter[] = ['all', 'active', 'deleted'];

export function UsersPanel() {
  const { t } = useTranslation();
  const lang = useLang();
  const router = useRouter();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<UserFilter>('all');
  const [page, setPage] = useState(1);
  const q = useDebouncedValue(text.trim());
  const users = useDeveloperUsers({ q, status, page });
  const data = users.data;

  return (
    <View style={{ gap: space.s3 }}>
      <TextField
        label={t('developer.list.searchUsers')}
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
          {FILTERS.map((key) => (
            <Chip
              key={key}
              kind="filter"
              label={t(`developer.filters.${key}`)}
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
        <Txt color="textSecondary">{t('developer.users.count', { count: data.total })}</Txt>
      ) : null}
      {users.isPending ? <SkeletonRows rows={6} /> : null}
      {users.isError ? (
        <EmptyState
          icon={CircleAlert}
          title={t('emptyStates.loadFailed.title')}
          body={errorMessage(users.error, t, lang)}
          actionLabel={t('common.actions.retry')}
          onAction={() => void users.refetch()}
        />
      ) : null}
      {data && data.items.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t('developer.list.emptyUsers.title')}
          body={t('developer.list.emptyUsers.body')}
        />
      ) : null}
      {data && data.items.length > 0 ? (
        <View style={{ marginHorizontal: -space.s4 }}>
          <GroupedList>
            {data.items.map((user) => (
              <ListRow
                key={user.id}
                leading={<Avatar name={user.name} />}
                title={user.name}
                subtitle={[
                  user.phone ?? t('developer.user.noPhone'),
                  t('developer.users.groups', { count: user.groupCount }),
                ].join(' · ')}
                trailingNote={
                  user.status === 'DELETED' ? (
                    <LabelBadge label={t('developer.users.deleted')} />
                  ) : (
                    <Txt variant="caption" color="textSecondary">
                      {user.lastLoginAt
                        ? t('developer.users.lastLogin', {
                            date: formatDateTime(user.lastLoginAt, lang),
                          })
                        : t('developer.users.neverLoggedIn')}
                    </Txt>
                  )
                }
                chevron
                onPress={() => router.push(`/developer/user/${user.id}`)}
              />
            ))}
          </GroupedList>
        </View>
      ) : null}
      {data ? (
        <Pager page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
      ) : null}
    </View>
  );
}
