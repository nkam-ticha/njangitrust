// One meeting (spec 1.4 Meetings, R15.2 to R15.4): check-in in the window, an excuse before the start, an
// agenda item, the attendance, and the minutes. Check-in, excuses and agenda items act directly, as the
// member's own acts (R15.3); the admin's attendance and minutes come back as cards (spec 4.5).
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { newRoute } from '../shared/routes';
import { useTranslation } from 'react-i18next';
import { CircleAlert } from 'lucide-react-native';
import { formatClock, formatDateTime, pick } from '@njangi/shared';
import type { AttendanceRowDto, AttendanceStatus } from '@njangi/shared/contracts/meetings';
import type { PendingActionDto } from '@njangi/shared/contracts/pending-actions';
import { space } from '@/theme';
import {
  AppHeader,
  Banner,
  BottomSheet,
  Button,
  EmptyState,
  GroupedList,
  ListRow,
  SectionHeader,
  SkeletonRows,
  TextField,
  Txt,
  useLang,
} from '@/ui';
import { useConnectivity } from '@/state/connectivity';
import { useActiveGroup } from '@/features/groups/useGroups';
import {
  useAddAgendaItem,
  useAttendance,
  useCheckIn,
  useMarkAttendance,
  useMeeting,
  useRefreshMeetings,
  useSendExcuse,
} from '@/features/meetings/useMeetings';
import { errorMessage } from '@/features/errors/errorMessage';
import { ActionCard } from '../shared/ActionCard';
import { Screen } from '../shared/Screen';
import { MinutesPanel } from './MinutesPanel';

export function MeetingDetailScreen({ meetingId }: { meetingId: string }) {
  const { t } = useTranslation();
  const lang = useLang();
  const router = useRouter();
  const online = useConnectivity((s) => s.online);
  const { group } = useActiveGroup();
  const meeting = useMeeting(meetingId);
  const attendance = useAttendance(meetingId);
  const refresh = useRefreshMeetings(group?.groupId ?? null, meetingId);
  const checkIn = useCheckIn(meetingId);
  const admin = group?.role === 'ADMIN';
  const [excusing, setExcusing] = useState(false);
  const [adding, setAdding] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace(newRoute('/meetings')));
  const header = <AppHeader kind="pushed" title={t('meetings.title')} onBack={back} />;

  if (meeting.isPending) {
    return (
      <Screen header={header}>
        <SkeletonRows rows={4} />
      </Screen>
    );
  }
  if (meeting.isError) {
    return (
      <Screen header={header}>
        <EmptyState
          icon={CircleAlert}
          title={t('emptyStates.loadFailed.title')}
          body={errorMessage(meeting.error, t, lang)}
          actionLabel={t('common.actions.retry')}
          onAction={() => void meeting.refetch()}
        />
      </Screen>
    );
  }
  const m = meeting.data;
  const windowText = t('meetings.checkIn.window', {
    start: formatClock(m.checkIn.opensAt, lang),
    end: formatClock(m.checkIn.closesAt, lang),
  });

  return (
    <Screen header={header}>
      <Txt variant="sectionTitle">{formatDateTime(m.scheduledAt, lang)}</Txt>
      <Txt color="textSecondary">
        {t('common.labelValue', { label: t('meetings.place'), value: m.place })}
      </Txt>
      <Txt variant="secondary" color="textSecondary">
        {t(`meetings.status.${m.status}`)}
      </Txt>

      {m.me.status === 'PRESENT' && m.me.checkedInAt ? (
        <Banner
          kind="info"
          text={t('meetings.checkIn.done', { time: formatClock(m.me.checkedInAt, lang) })}
        />
      ) : null}
      {m.me.canCheckIn ? (
        <>
          <Txt variant="secondary" color="textSecondary">
            {windowText}
          </Txt>
          <Button
            fullWidth
            label={t('meetings.checkIn.button')}
            loading={checkIn.isPending}
            offline={!online}
            disabled={checkIn.isPending}
            onPress={() => checkIn.mutate(undefined, { onSuccess: () => refresh() })}
          />
        </>
      ) : null}
      {m.me.canExcuse ? (
        <Button
          variant="secondary"
          fullWidth
          label={t('meetings.excuse.button')}
          onPress={() => setExcusing(true)}
        />
      ) : null}
      {checkIn.error ? (
        <Txt variant="secondary" color="textDanger">
          {errorMessage(checkIn.error, t, lang)}
        </Txt>
      ) : null}

      <SectionHeader
        inset={false}
        title={t('meetings.agenda.title')}
        actionLabel={t('meetings.agenda.add')}
        onAction={() => setAdding(true)}
      />
      {m.agendaGeneratedAt === null ? (
        <Txt color="textSecondary">{t('meetings.agenda.pending')}</Txt>
      ) : null}
      {m.agenda.length ? (
        <View style={{ marginHorizontal: -space.s4 }}>
          <GroupedList>
            {m.agenda.map((item) => (
              <ListRow
                key={item.id}
                titleWeight="regular"
                title={pick(item.text, lang)}
                subtitle={
                  item.source === 'AUTO'
                    ? t('meetings.agenda.auto')
                    : t('meetings.agenda.byMember', { name: item.author?.name ?? '' })
                }
              />
            ))}
          </GroupedList>
        </View>
      ) : null}

      <SectionHeader inset={false} title={t('meetings.attendance.title')} />
      {attendance.isPending ? <SkeletonRows rows={3} /> : null}
      {attendance.isError ? (
        <Txt variant="secondary" color="textDanger">
          {errorMessage(attendance.error, t, lang)}
        </Txt>
      ) : null}
      {attendance.data ? (
        <AttendanceList
          meetingId={meetingId}
          rows={attendance.data}
          admin={!!admin}
          onSaved={refresh}
          lang={lang}
        />
      ) : null}

      <MinutesPanel meetingId={meetingId} admin={!!admin} onChanged={refresh} />

      <BottomSheet
        visible={excusing}
        onClose={() => setExcusing(false)}
        title={t('meetings.excuse.button')}
      >
        {excusing ? (
          <ExcuseForm
            meetingId={meetingId}
            onDone={() => {
              setExcusing(false);
              refresh();
            }}
          />
        ) : null}
      </BottomSheet>
      <BottomSheet
        visible={adding}
        onClose={() => setAdding(false)}
        title={t('meetings.agenda.add')}
      >
        {adding ? (
          <AgendaForm
            meetingId={meetingId}
            onDone={() => {
              setAdding(false);
              refresh();
            }}
          />
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

const STATUS_ORDER: AttendanceStatus[] = ['PRESENT', 'EXCUSED', 'ABSENT', 'UNMARKED'];

function AttendanceList({
  meetingId,
  rows,
  admin,
  onSaved,
  lang,
}: {
  meetingId: string;
  rows: AttendanceRowDto[];
  admin: boolean;
  onSaved: () => void;
  lang: 'fr' | 'en';
}) {
  const { t } = useTranslation();
  const online = useConnectivity((s) => s.online);
  const mark = useMarkAttendance(meetingId);
  const [present, setPresent] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(rows.map((r) => [r.member.membershipId, r.status === 'PRESENT'])),
  );
  const [action, setAction] = useState<PendingActionDto | null>(null);
  const groups = STATUS_ORDER.map((status) => ({
    status,
    rows: rows.filter((r) => r.status === status),
  }));

  return (
    <View style={{ gap: space.s3 }}>
      {groups.map((g) =>
        g.rows.length ? (
          <View key={g.status} style={{ gap: space.s1 }}>
            <Txt variant="captionStrong" color="textSecondary">
              {t(
                `meetings.attendance.${g.status === 'PRESENT' ? 'present' : g.status === 'EXCUSED' ? 'excused' : g.status === 'ABSENT' ? 'absent' : 'unmarked'}`,
                { count: g.rows.length },
              )}
            </Txt>
            <View style={{ marginHorizontal: -space.s4 }}>
              <GroupedList>
                {g.rows.map((r) => (
                  <ListRow
                    key={r.member.membershipId}
                    titleWeight="regular"
                    title={r.member.name}
                    subtitle={
                      r.status === 'EXCUSED' && r.excuseReason
                        ? `${t('meetings.attendance.rowStatus.excused')} · ${r.excuseReason}`
                        : r.status === 'PRESENT' && r.checkedInAt
                          ? t('meetings.attendance.rowStatus.present', {
                              time: formatClock(r.checkedInAt, lang),
                            })
                          : t(
                              `meetings.attendance.rowStatus.${r.status.toLowerCase()}` as 'meetings.attendance.rowStatus.unmarked',
                            )
                    }
                    onPress={
                      admin && !action
                        ? () =>
                            setPresent((p) => ({
                              ...p,
                              [r.member.membershipId]: !p[r.member.membershipId],
                            }))
                        : undefined
                    }
                    selected={admin && !!present[r.member.membershipId]}
                  />
                ))}
              </GroupedList>
            </View>
          </View>
        ) : null,
      )}
      {admin ? (
        action ? (
          <ActionCard
            action={action}
            onConfirmed={onSaved}
            onCancelled={() => setAction(null)}
            onClose={() => setAction(null)}
          />
        ) : (
          <>
            <Button
              variant="secondary"
              fullWidth
              label={t('common.actions.save')}
              loading={mark.isPending}
              offline={!online}
              disabled={mark.isPending}
              onPress={() =>
                mark.mutate(
                  {
                    marks: rows.map((r) => ({
                      membershipId: r.member.membershipId,
                      present: !!present[r.member.membershipId],
                    })),
                  },
                  { onSuccess: (prepared) => setAction(prepared) },
                )
              }
            />
            {mark.error ? (
              <Txt variant="secondary" color="textDanger">
                {errorMessage(mark.error, t, lang)}
              </Txt>
            ) : null}
          </>
        )
      ) : null}
    </View>
  );
}

function ExcuseForm({ meetingId, onDone }: { meetingId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const online = useConnectivity((s) => s.online);
  const excuse = useSendExcuse(meetingId);
  const [reason, setReason] = useState('');
  return (
    <View style={{ gap: space.s3 }}>
      <TextField
        label={t('meetings.excuse.button')}
        placeholder={t('meetings.excuse.placeholder')}
        value={reason}
        onChangeText={setReason}
        maxLength={300}
      />
      {excuse.error ? (
        <Txt variant="secondary" color="textDanger">
          {errorMessage(excuse.error, t, lang)}
        </Txt>
      ) : null}
      <Button
        fullWidth
        label={t('common.actions.send')}
        loading={excuse.isPending}
        offline={!online}
        disabled={!reason.trim() || excuse.isPending}
        onPress={() => excuse.mutate({ reason: reason.trim() }, { onSuccess: onDone })}
      />
    </View>
  );
}

function AgendaForm({ meetingId, onDone }: { meetingId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const online = useConnectivity((s) => s.online);
  const add = useAddAgendaItem(meetingId);
  const [text, setText] = useState('');
  return (
    <View style={{ gap: space.s3 }}>
      <TextField
        label={t('meetings.agenda.add')}
        placeholder={t('meetings.agenda.addPlaceholder')}
        value={text}
        onChangeText={setText}
        maxLength={300}
      />
      {add.error ? (
        <Txt variant="secondary" color="textDanger">
          {errorMessage(add.error, t, lang)}
        </Txt>
      ) : null}
      <Button
        fullWidth
        label={t('common.actions.add')}
        loading={add.isPending}
        offline={!online}
        disabled={!text.trim() || add.isPending}
        onPress={() => add.mutate(text.trim(), { onSuccess: onDone })}
      />
    </View>
  );
}
