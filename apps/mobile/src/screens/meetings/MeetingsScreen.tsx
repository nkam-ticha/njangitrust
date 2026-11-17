// Meetings list (spec 1.4 Meetings, R15): upcoming and past meetings of the group. The admin schedules a
// meeting (a card the admin confirms, spec 4.5); everyone opens a meeting for check-in, excuses and agenda.
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { newRoute } from '../shared/routes';
import { useTranslation } from 'react-i18next';
import { CircleAlert } from 'lucide-react-native';
import { doualaDay, doualaInstant } from '../shared/doualaDay';
import { formatDateTime } from '@njangi/shared';
import type { PendingActionDto } from '@njangi/shared/contracts/pending-actions';
import { space } from '@/theme';
import {
  AppHeader,
  BottomSheet,
  Button,
  Chip,
  ChipRow,
  DateField,
  EmptyState,
  GroupedList,
  ListRow,
  SkeletonRows,
  TextField,
  TimeField,
  Txt,
  useLang,
} from '@/ui';
import { useConnectivity } from '@/state/connectivity';
import { useActiveGroup } from '@/features/groups/useGroups';
import {
  useMeetings,
  useRefreshMeetings,
  useScheduleMeeting,
} from '@/features/meetings/useMeetings';
import { errorMessage } from '@/features/errors/errorMessage';
import { ActionCard } from '../shared/ActionCard';
import { Screen } from '../shared/Screen';

export function MeetingsScreen() {
  const { t } = useTranslation();
  const lang = useLang();
  const router = useRouter();
  const { group } = useActiveGroup();
  const groupId = group?.groupId ?? null;
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const meetings = useMeetings(groupId, when);
  const refresh = useRefreshMeetings(groupId, null);
  const [scheduling, setScheduling] = useState(false);
  const admin = group?.role === 'ADMIN';
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <Screen
      header={<AppHeader kind="pushed" title={t('meetings.title')} onBack={back} />}
      footer={
        admin && groupId ? (
          <Button fullWidth label={t('meetings.schedule')} onPress={() => setScheduling(true)} />
        ) : undefined
      }
    >
      <ChipRow label={t('meetings.title')}>
        <Chip
          label={t('meetings.upcoming')}
          selected={when === 'upcoming'}
          onPress={() => setWhen('upcoming')}
        />
        <Chip
          label={t('meetings.past')}
          selected={when === 'past'}
          onPress={() => setWhen('past')}
        />
      </ChipRow>

      {meetings.isPending ? <SkeletonRows rows={3} /> : null}
      {meetings.isError ? (
        <EmptyState
          icon={CircleAlert}
          title={t('emptyStates.loadFailed.title')}
          body={errorMessage(meetings.error, t, lang)}
          actionLabel={t('common.actions.retry')}
          onAction={() => void meetings.refetch()}
        />
      ) : null}
      {meetings.isSuccess && !meetings.data.length ? (
        <Txt color="textSecondary">{admin ? t('meetings.noneAdmin') : t('meetings.none')}</Txt>
      ) : null}
      {meetings.data?.length ? (
        <View style={{ marginHorizontal: -space.s4 }}>
          <GroupedList>
            {meetings.data.map((m) => (
              <ListRow
                key={m.id}
                title={formatDateTime(m.scheduledAt, lang)}
                subtitle={t('common.labelValue', { label: t('meetings.place'), value: m.place })}
                trailing={
                  <Txt variant="secondary" color="textSecondary">
                    {t(`meetings.status.${m.status}`)}
                  </Txt>
                }
                chevron
                onPress={() => router.push(newRoute(`/meetings/${m.id}`))}
              />
            ))}
          </GroupedList>
        </View>
      ) : null}

      <BottomSheet
        visible={scheduling}
        onClose={() => setScheduling(false)}
        title={t('meetings.form.title')}
      >
        {scheduling && groupId ? (
          <ScheduleForm
            groupId={groupId}
            onDone={() => {
              setScheduling(false);
              refresh();
            }}
          />
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

function ScheduleForm({ groupId, onDone }: { groupId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const online = useConnectivity((s) => s.online);
  const schedule = useScheduleMeeting(groupId);
  const [today] = useState(() => doualaDay(new Date(Date.now())));
  const [day, setDay] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [place, setPlace] = useState('');
  const [action, setAction] = useState<PendingActionDto | null>(null);

  if (action) {
    return (
      <ActionCard
        action={action}
        onConfirmed={onDone}
        onCancelled={() => setAction(null)}
        onClose={onDone}
      />
    );
  }
  const ready = !!day && !!time && place.trim().length > 0;
  return (
    <View style={{ gap: space.s3 }}>
      <DateField
        label={t('meetings.form.date')}
        value={day}
        onChange={setDay}
        minDay={today}
        today={today}
      />
      <TimeField label={t('meetings.form.time')} value={time} onChange={setTime} />
      <TextField
        label={t('meetings.form.place')}
        placeholder={t('meetings.form.placePlaceholder')}
        value={place}
        onChangeText={setPlace}
        maxLength={200}
      />
      {schedule.error ? (
        <Txt variant="secondary" color="textDanger">
          {errorMessage(schedule.error, t, lang)}
        </Txt>
      ) : null}
      <Button
        fullWidth
        label={t('common.actions.continue')}
        loading={schedule.isPending}
        offline={!online}
        disabled={!ready || schedule.isPending}
        onPress={() => {
          if (!day || !time) return;
          schedule.mutate(
            { scheduledAt: doualaInstant(day, time), place: place.trim() },
            { onSuccess: (prepared) => setAction(prepared) },
          );
        }}
      />
    </View>
  );
}
