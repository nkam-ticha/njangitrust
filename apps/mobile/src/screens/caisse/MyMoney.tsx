// My money in the group (spec 1.4 Caisse, R5, CAI-03): what I can withdraw now, what is locked, the
// debts due, any hold, and what I owe (each due, oldest first). Every figure is the server's.
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatDateLong, formatDateShort } from '@njangi/shared';
import type { UseQueryResult } from '@tanstack/react-query';
import { space } from '@/theme';
import {
  AmountText,
  Banner,
  Button,
  GroupedList,
  ListRow,
  SectionHeader,
  SkeletonRows,
  Txt,
  useLang,
} from '@/ui';
import type { DueDto, MyMoneyDto } from '@/features/money/schemas';
import { errorMessage } from '@/features/errors/errorMessage';

interface MyMoneyProps {
  money: UseQueryResult<MyMoneyDto>;
  dues: UseQueryResult<DueDto[]>;
  operator: string;
  onPay: () => void;
  onWithdraw: () => void;
}

export function MyMoney({ money, dues, onPay, onWithdraw }: MyMoneyProps) {
  const { t } = useTranslation();
  const lang = useLang();
  if (money.isPending || dues.isPending) return <SkeletonRows rows={2} />;
  if (money.isError || dues.isError) {
    return (
      <Banner
        kind="error"
        text={errorMessage(money.error ?? dues.error, t, lang)}
        actionLabel={t('common.actions.retry')}
        onAction={() => {
          void money.refetch();
          void dues.refetch();
        }}
      />
    );
  }
  const figures = money.data;
  const open = dues.data ?? [];
  const canWithdraw =
    figures.available > 0 && !figures.withdrawalsPaused && !figures.withdrawalInProgress;
  return (
    <View style={styles.column}>
      <View style={styles.card}>
        <Txt variant="secondary" color="textSecondary">
          {t('moi.available')}
        </Txt>
        <AmountText amount={figures.available} size="large" align="left" />
        {figures.unlocksAt ? (
          <Txt variant="secondary" color="textSecondary">
            {t('withdraw.locked', { date: formatDateLong(figures.unlocksAt, lang) })}
          </Txt>
        ) : null}
        {figures.hold ? (
          <Txt variant="secondary" color="textSecondary">
            {t('withdraw.hold', { date: formatDateShort(figures.hold.until, lang) })}
          </Txt>
        ) : null}
        {figures.debtsDue > 0 ? (
          <Txt variant="secondary" color="textSecondary">
            {t('common.labelOnly', { label: t('moi.debts') })}{' '}
            <AmountText amount={figures.debtsDue} size="small" />
          </Txt>
        ) : null}
        {figures.withdrawalsPaused ? <Banner kind="error" text={t('withdraw.paused')} /> : null}
        {figures.withdrawalInProgress ? (
          <Banner kind="info" text={t('withdraw.inProgress')} />
        ) : null}
        <View style={styles.actions}>
          {open.length ? <Button fullWidth label={t('agent.chips.pay')} onPress={onPay} /> : null}
          <Button
            fullWidth
            variant="secondary"
            label={t('withdraw.titleGeneric')}
            disabled={!canWithdraw}
            onPress={onWithdraw}
          />
          {figures.available <= 0 ? (
            <Txt variant="secondary" color="textSecondary">
              {t('withdraw.nothing')}
            </Txt>
          ) : null}
        </View>
      </View>

      <SectionHeader inset={false} title={t('moi.debts')} />
      {open.length ? (
        <View style={styles.flush}>
          <GroupedList>
            {open.map((due) => (
              <ListRow
                key={due.id}
                title={t(`caisse.dues.kinds.${due.kind}`)}
                subtitle={t('caisse.dues.dueBy', { date: formatDateShort(due.dueAt, lang) })}
                trailing={<AmountText amount={due.amount} size="small" />}
              />
            ))}
          </GroupedList>
        </View>
      ) : (
        <Txt color="textSecondary">{t('caisse.dues.none')}</Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.s3 },
  card: { gap: space.s2, paddingVertical: space.s2 },
  actions: { gap: space.s2, marginTop: space.s2 },
  flush: { marginHorizontal: -space.s4 },
});
