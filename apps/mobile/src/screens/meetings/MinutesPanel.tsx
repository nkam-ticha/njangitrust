// Procès-verbal (spec R15.4): everyone reads the published minutes; the admin drafts them with Njangi from
// their notes, edits the draft, and publishes it as a card. Published minutes never change: a correction is
// a new version with a reason (the reason is required from the second version on).
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatDateLong } from '@njangi/shared';
import type { PendingActionDto } from '@njangi/shared/contracts/pending-actions';
import { space } from '@/theme';
import { Banner, Button, SectionHeader, TextField, Txt, useLang } from '@/ui';
import { useConnectivity } from '@/state/connectivity';
import { useDraftMinutes, useMinutes, usePublishMinutes } from '@/features/meetings/useMeetings';
import { errorMessage } from '@/features/errors/errorMessage';
import { ActionCard } from '../shared/ActionCard';

interface MinutesPanelProps {
  meetingId: string;
  admin: boolean;
  onChanged: () => void;
}

export function MinutesPanel({ meetingId, admin, onChanged }: MinutesPanelProps) {
  const { t } = useTranslation();
  const lang = useLang();
  const minutes = useMinutes(meetingId);
  const versions = minutes.data?.versions ?? [];
  const latest = versions[0] ?? null;

  return (
    <View style={{ gap: space.s3 }}>
      <SectionHeader inset={false} title={t('meetings.minutes.title')} />
      {minutes.isError ? <Banner kind="error" text={errorMessage(minutes.error, t, lang)} /> : null}
      {latest ? (
        <View style={{ gap: space.s2 }}>
          <Txt variant="captionStrong" color="textSecondary">
            {t('meetings.minutes.version', { version: latest.version })} ·{' '}
            {t('meetings.minutes.published', {
              date: formatDateLong(latest.publishedAt, lang, { withYear: true }),
            })}
          </Txt>
          <Txt selectable>{latest.text}</Txt>
        </View>
      ) : (
        <Txt color="textSecondary">{t('meetings.minutes.notPublished')}</Txt>
      )}
      {admin ? (
        <AdminMinutes
          meetingId={meetingId}
          hasVersions={versions.length > 0}
          onChanged={onChanged}
        />
      ) : null}
    </View>
  );
}

function AdminMinutes({
  meetingId,
  hasVersions,
  onChanged,
}: {
  meetingId: string;
  hasVersions: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const online = useConnectivity((s) => s.online);
  const draft = useDraftMinutes(meetingId);
  const publish = usePublishMinutes(meetingId);
  const [notes, setNotes] = useState('');
  const [text, setText] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [action, setAction] = useState<PendingActionDto | null>(null);

  if (action) {
    return (
      <ActionCard
        action={action}
        onConfirmed={onChanged}
        onCancelled={() => setAction(null)}
        onClose={() => setAction(null)}
      />
    );
  }
  return (
    <View style={{ gap: space.s3 }}>
      <Txt variant="secondary" color="textSecondary">
        {t('meetings.minutes.draftOnlyAdmin')}
      </Txt>
      <TextField
        label={t('meetings.minutes.notes')}
        placeholder={t('meetings.minutes.notesPlaceholder')}
        value={notes}
        onChangeText={setNotes}
        multiline
        maxLength={4000}
      />
      <Button
        variant="secondary"
        fullWidth
        label={draft.isPending ? t('meetings.minutes.generating') : t('meetings.minutes.generate')}
        loading={draft.isPending}
        offline={!online}
        disabled={draft.isPending}
        onPress={() =>
          draft.mutate(notes.trim() ? { notes: notes.trim() } : {}, {
            onSuccess: (d) => setText(d.text),
          })
        }
      />
      {draft.error ? (
        <Txt variant="secondary" color="textDanger">
          {errorMessage(draft.error, t, lang)}
        </Txt>
      ) : null}
      {text !== null ? (
        <>
          <TextField
            label={t('meetings.minutes.draft')}
            value={text}
            onChangeText={setText}
            multiline
          />
          <Txt variant="secondary" color="textSecondary">
            {t('meetings.minutes.publishNote')}
          </Txt>
          {hasVersions ? (
            <TextField
              label={t('meetings.minutes.correctionReason')}
              value={reason}
              onChangeText={setReason}
              maxLength={300}
            />
          ) : null}
          {publish.error ? (
            <Txt variant="secondary" color="textDanger">
              {errorMessage(publish.error, t, lang)}
            </Txt>
          ) : null}
          <Button
            fullWidth
            label={hasVersions ? t('meetings.minutes.correct') : t('meetings.minutes.publish')}
            loading={publish.isPending}
            offline={!online}
            disabled={!text.trim() || publish.isPending || (hasVersions && !reason.trim())}
            onPress={() =>
              publish.mutate(
                hasVersions ? { text: text.trim(), reason: reason.trim() } : { text: text.trim() },
                { onSuccess: (prepared) => setAction(prepared) },
              )
            }
          />
        </>
      ) : null}
    </View>
  );
}
