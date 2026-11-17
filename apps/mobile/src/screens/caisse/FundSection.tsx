// Caisse, Caisse générale segment (SCREENS.md S-13; spec 1.4, R9): the general fund's balance, what can
// be lent, and the loans in progress. The figures are the server's (ledger balances in packages/rules).
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { newRoute } from '../shared/routes';
import { useTranslation } from 'react-i18next';
import { CircleAlert } from 'lucide-react-native';
import type { MyGroupDto } from '@njangi/shared/contracts/me';
import { space } from '@/theme';
import {
  AmountText,
  Button,
  EmptyState,
  GroupedList,
  ListRow,
  SectionHeader,
  SkeletonRows,
  Txt,
  useLang,
} from '@/ui';
import { useFunds } from '@/features/money/queries';
import { useLoans } from '@/features/loans/useLoans';
import { errorMessage } from '@/features/errors/errorMessage';

export function FundSection({ group }: { group: MyGroupDto }) {
  const { t } = useTranslation();
  const lang = useLang();
  const router = useRouter();
  const funds = useFunds(group.groupId);
  const loans = useLoans(group.groupId);

  if (funds.isPending) return <SkeletonRows rows={3} />;
  if (funds.isError) {
    return (
      <EmptyState
        icon={CircleAlert}
        title={t('emptyStates.loadFailed.title')}
        body={errorMessage(funds.error, t, lang)}
        actionLabel={t('common.actions.retry')}
        onAction={() => void funds.refetch()}
      />
    );
  }
  const figures = funds.data;
  const open = (loans.data ?? []).filter((l) =>
    ['APPROVED', 'DISBURSED', 'OVERDUE'].includes(l.status),
  );
  const toDecide = (loans.data ?? []).filter((l) => l.status === 'REQUESTED').length;

  return (
    <View style={styles.column}>
      <View style={styles.card}>
        <Txt variant="secondary" color="textSecondary">
          {t('caisse.fund.balance')}
        </Txt>
        <AmountText amount={figures.generalFund} size="large" align="left" />
        <Txt variant="secondary" color="textSecondary">
          {t('caisse.fund.availableForLoans')}
        </Txt>
        <AmountText amount={figures.availableForLoans} size="body" align="left" />
        <Txt variant="secondary" color="textSecondary">
          {t('caisse.fund.reservedHelp')}
        </Txt>
        <Txt variant="secondary" color="textSecondary">
          {t('caisse.fund.sources')}
        </Txt>
        <Txt variant="secondary" color="textSecondary">
          {t('caisse.fund.distribution')}
        </Txt>
      </View>

      {toDecide > 0 ? (
        <Txt color="textSecondary">{t('caisse.fund.loansToDecide', { count: toDecide })}</Txt>
      ) : null}

      <SectionHeader inset={false} title={t('caisse.fund.loansInProgress')} />
      {open.length ? (
        <View style={styles.flush}>
          <GroupedList>
            {open.map((loan) => (
              <ListRow
                key={loan.id}
                title={loan.borrower.name}
                subtitle={t(`loans.status.${loan.status}`)}
                trailing={<AmountText amount={loan.principal} size="small" />}
                onPress={() => router.push(newRoute('/loans'))}
                chevron
              />
            ))}
          </GroupedList>
        </View>
      ) : (
        <Txt color="textSecondary">{t('caisse.fund.emptyLoans')}</Txt>
      )}

      <Button
        fullWidth
        label={t('caisse.fund.requestLoan')}
        onPress={() => router.push(newRoute('/loans'))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.s3 },
  card: { gap: space.s1, paddingVertical: space.s2 },
  flush: { marginHorizontal: -space.s4 },
});
