// Caisse: the admin starts the next cycle (D40.2). The first payout date and time start at the date
// the server suggests; the card the admin confirms (L1, rule 5) shows the kept order and the members.
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { PendingActionDto } from '@njangi/shared/contracts/pending-actions';
import { fromDoualaLocal } from '@njangi/rules';
import { formatDateTime, toDouala } from '@njangi/shared';
import { space } from '@/theme';
import {
  BottomSheet,
  Button,
  DateField,
  GroupedList,
  ListRow,
  SkeletonRows,
  TimeField,
  Txt,
  useLang,
} from '@/ui';
import { useNextCyclePreview, useStartNextCycle } from '@/features/cycles/queries';
import { useRefreshMoney } from '@/features/money/queries';
import { errorMessage } from '@/features/errors/errorMessage';
import { ActionCard } from '../shared/ActionCard';

const pad = (n: number) => String(n).padStart(2, '0');
const dayOf = (iso: string) => {
  const p = toDouala(iso);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
};
const timeOf = (iso: string) => {
  const p = toDouala(iso);
  return `${pad(p.hour)}:${pad(p.minute)}`;
};

export function StartNextCycleSheet({
  visible,
  groupId,
  onClose,
}: {
  visible: boolean;
  groupId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const preview = useNextCyclePreview(groupId, visible);
  const start = useStartNextCycle(groupId);
  const refresh = useRefreshMoney(groupId);
  // The fields show the suggested date until the admin changes them.
  const [pickedDay, setDay] = useState<string | null>(null);
  const [pickedTime, setTime] = useState<string | null>(null);
  const [action, setAction] = useState<PendingActionDto | null>(null);
  const suggested = preview.data?.suggestedFirstPayoutAt ?? null;
  const today = useMemo(() => dayOf(new Date().toISOString()), []);
  const day = pickedDay ?? (suggested ? dayOf(suggested) : null);
  const time = pickedTime ?? (suggested ? timeOf(suggested) : null);

  const close = () => {
    setAction(null);
    onClose();
  };
  const data = preview.data;
  // Rule 9: the Douala time zone comes from the shared helper, never a literal offset.
  const chosen =
    day && time
      ? fromDoualaLocal({
          year: Number(day.slice(0, 4)),
          month: Number(day.slice(5, 7)),
          day: Number(day.slice(8, 10)),
          hour: Number(time.slice(0, 2)),
          minute: Number(time.slice(3, 5)),
        }).toISOString()
      : null;

  return (
    <BottomSheet
      visible={visible}
      onClose={close}
      title={data ? t('caisse.cycleEnd.next.title', { cycle: data.number }) : ''}
      // F2: the button stays in view on a small screen while the order and the date scroll.
      footer={
        data && !action ? (
          <Button
            fullWidth
            label={t('caisse.cycleEnd.next.start')}
            disabled={!chosen}
            loading={start.isPending}
            onPress={() => chosen && start.mutate(chosen, { onSuccess: setAction })}
          />
        ) : undefined
      }
    >
      {preview.isPending || !data ? <SkeletonRows rows={3} /> : null}
      {data ? (
        <View style={styles.column}>
          <Txt>
            {t(
              data.participants === 1
                ? 'caisse.cycleEnd.next.participants_one'
                : 'caisse.cycleEnd.next.participants_other',
              { count: data.participants },
            )}
          </Txt>
          {data.newcomers > 0 ? (
            <Txt variant="secondary" color="textSecondary">
              {t(
                data.newcomers === 1
                  ? 'caisse.cycleEnd.next.newcomers_one'
                  : 'caisse.cycleEnd.next.newcomers_other',
                { count: data.newcomers },
              )}
            </Txt>
          ) : null}
          <Txt variant="secondary" color="textSecondary">
            {data.orderKind === 'KEPT'
              ? t('caisse.cycleEnd.next.orderKept')
              : data.orderKind === 'BIDDING'
                ? t('caisse.cycleEnd.next.orderBidding')
                : t('caisse.cycleEnd.next.orderDrawn')}
          </Txt>
          {data.orderKind === 'KEPT' ? (
            <GroupedList>
              {data.order.map((member, index) => (
                <ListRow key={member.membershipId} title={`${index + 1}. ${member.name}`} />
              ))}
            </GroupedList>
          ) : null}
          {!action ? (
            <>
              <DateField
                label={t('caisse.cycleEnd.next.firstPayout')}
                value={day}
                onChange={setDay}
                today={today}
                minDay={today}
              />
              <TimeField
                label={t('caisse.cycleEnd.next.firstPayoutTime')}
                value={time}
                onChange={setTime}
              />
              {suggested ? (
                <Txt variant="secondary" color="textSecondary">
                  {t('caisse.cycleEnd.next.suggested', {
                    date: formatDateTime(suggested, lang, { withYear: true }),
                  })}
                </Txt>
              ) : null}
              {start.error ? (
                <Txt variant="secondary" color="textDanger">
                  {errorMessage(start.error, t, lang)}
                </Txt>
              ) : null}
            </>
          ) : (
            <ActionCard
              action={action}
              onConfirmed={() => {
                refresh();
                close();
              }}
              onCancelled={() => setAction(null)}
              onClose={close}
            />
          )}
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({ column: { gap: space.s3 } });
