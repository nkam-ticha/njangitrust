// Caisse, Registre segment (SCREENS.md S-15, S-17; spec 1.4, 2.5, LED-01..04): every franc of the group,
// in order, with the daily check strip, filters by type, paging, and each entry's postings and hashes.
// Nothing here calculates money: amounts and balances are the ledger's (packages/rules on the server).
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CircleAlert, ScrollText } from 'lucide-react-native';
import { formatClock, formatDateShort, formatDateTime, pick } from '@njangi/shared';
import type { MyGroupDto } from '@njangi/shared/contracts/me';
import { space } from '@/theme';
import {
  AmountText,
  BottomSheet,
  Button,
  Chip,
  ChipRow,
  DailyCheckStrip,
  EmptyState,
  GroupedList,
  LedgerRow,
  ListRow,
  SkeletonRows,
  Txt,
  useLang,
} from '@/ui';
import { useMembers } from '@/features/groups/useGroups';
import { ledgerTypeOf } from '@/features/money/ledgerTypes';
import { useLedger, useReconciliation } from '@/features/money/queries';
import type { LedgerEntryDto } from '@/features/money/schemas';
import { errorMessage } from '@/features/errors/errorMessage';

/** The filters the API knows (one type each); "decisions" is the governance event type. */
const FILTERS: { key: string; type: string | null }[] = [
  { key: 'all', type: null },
  { key: 'payments', type: 'PAYMENT_RECEIVED' },
  { key: 'payouts', type: 'WITHDRAWAL_COMPLETED' },
  { key: 'loans', type: 'LOAN_DISBURSED' },
  { key: 'fines', type: 'FINE_ASSESSED' },
  { key: 'solidarity', type: 'SOLIDARITY_DISBURSED' },
  { key: 'decisions', type: 'EVENT' },
];

export function LedgerSection({ group }: { group: MyGroupDto }) {
  const { t } = useTranslation();
  const lang = useLang();
  const groupId = group.groupId;
  const [filter, setFilter] = useState<string | null>(null);
  const [open, setOpen] = useState<LedgerEntryDto | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);
  const ledger = useLedger(groupId, filter);
  const reconciliation = useReconciliation(groupId);
  const members = useMembers(groupId);
  const names = new Map((members.data ?? []).map((m) => [m.membershipId, m.name]));

  const entries = ledger.data?.pages.flatMap((p) => p.entries) ?? [];
  const check = reconciliation.data;
  const checkStatus =
    check && (check.status === 'OK' || check.status === 'WARNING' || check.status === 'ALERT')
      ? check.status
      : 'NOT_YET';

  return (
    <View style={styles.column}>
      {/* No strip when the check cannot be read: "scheduled" would be a claim the app cannot make. */}
      {reconciliation.isError ? null : (
        <View style={styles.flush}>
          <DailyCheckStrip
            status={checkStatus}
            time={check ? formatClock(check.ranAt, lang) : undefined}
            lastDate={check ? formatDateShort(check.ranAt, lang) : undefined}
            onPress={() => setCheckOpen(true)}
          />
        </View>
      )}

      <Txt color="textSecondary">{t('caisse.ledger.intro')}</Txt>

      <ChipRow label={t('caisse.ledger.title')}>
        {FILTERS.map((f) => (
          <Chip
            key={f.key}
            label={t(`caisse.ledger.filters.${f.key}` as 'caisse.ledger.filters.all')}
            selected={filter === f.type}
            onPress={() => setFilter(f.type)}
          />
        ))}
      </ChipRow>

      {ledger.isPending ? <SkeletonRows rows={5} /> : null}
      {ledger.isError ? (
        <EmptyState
          icon={CircleAlert}
          title={t('emptyStates.loadFailed.title')}
          body={errorMessage(ledger.error, t, lang)}
          actionLabel={t('common.actions.retry')}
          onAction={() => void ledger.refetch()}
        />
      ) : null}
      {ledger.isSuccess && !entries.length ? (
        <EmptyState
          icon={ScrollText}
          title={t('caisse.ledger.title')}
          body={filter ? t('caisse.ledger.empty') : t('caisse.ledger.emptyAll')}
        />
      ) : null}

      {entries.length ? (
        <View style={styles.flush}>
          <GroupedList>
            {entries.map((entry) => {
              const cash = entry.postings.find((p) => p.account.startsWith('cash'));
              return (
                <LedgerRow
                  key={entry.id}
                  seq={entry.seq}
                  type={ledgerTypeOf(entry.type)}
                  description={pick({ fr: entry.descriptionFr, en: entry.descriptionEn }, lang)}
                  when={formatDateTime(entry.occurredAt, lang)}
                  cashAmount={cash ? cash.amount : null}
                  amount={cash ? null : (entry.postings[0]?.amount ?? null)}
                  onPress={() => setOpen(entry)}
                />
              );
            })}
          </GroupedList>
        </View>
      ) : null}

      {ledger.hasNextPage ? (
        <Button
          variant="secondary"
          fullWidth
          label={t('caisse.ledger.loadMore')}
          loading={ledger.isFetchingNextPage}
          onPress={() => void ledger.fetchNextPage()}
        />
      ) : null}

      <BottomSheet
        visible={!!open}
        onClose={() => setOpen(null)}
        title={open ? t('caisse.entry.title', { seq: open.seq }) : ''}
      >
        {open ? <EntrySheet entry={open} names={names} /> : null}
      </BottomSheet>

      <BottomSheet
        visible={checkOpen}
        onClose={() => setCheckOpen(false)}
        title={t('caisse.dailyCheck.sheet.title')}
      >
        <Txt>
          {t(
            checkStatus === 'OK'
              ? 'caisse.dailyCheck.sheet.okBody'
              : checkStatus === 'ALERT'
                ? 'caisse.dailyCheck.sheet.alertBody'
                : checkStatus === 'WARNING'
                  ? 'caisse.dailyCheck.sheet.warningBody'
                  : 'caisse.dailyCheck.notYet',
          )}
        </Txt>
      </BottomSheet>
    </View>
  );
}

function EntrySheet({ entry, names }: { entry: LedgerEntryDto; names: Map<string, string> }) {
  const { t } = useTranslation();
  const lang = useLang();
  const accountLabel = (account: string) => {
    if (account.startsWith('cash')) return t('caisse.entry.accounts.cash');
    if (account.startsWith('payable:member:')) {
      const id = account.slice('payable:member:'.length);
      return t('caisse.entry.accounts.payable', { name: names.get(id) ?? '' });
    }
    if (account.startsWith('receivable:member:')) {
      const id = account.slice('receivable:member:'.length);
      return t('caisse.entry.accounts.receivable', { name: names.get(id) ?? '' });
    }
    if (account.includes('solidarity')) return t('caisse.entry.accounts.fundSolidarity');
    if (account.includes('general')) return t('caisse.entry.accounts.fundGeneral');
    return t('caisse.entry.accounts.other');
  };
  return (
    <View style={styles.column}>
      <Txt color="textSecondary">{formatDateTime(entry.occurredAt, lang)}</Txt>
      <Txt>{pick({ fr: entry.descriptionFr, en: entry.descriptionEn }, lang)}</Txt>
      <Txt variant="sectionTitle">{t('caisse.entry.postings')}</Txt>
      <View style={styles.flush}>
        <GroupedList>
          {entry.postings.map((posting, i) => (
            <ListRow
              key={`${posting.account}-${i}`}
              titleWeight="regular"
              title={accountLabel(posting.account)}
              trailing={<AmountText amount={posting.amount} size="small" sign="always" />}
            />
          ))}
        </GroupedList>
      </View>
      <Txt variant="secondary" color="textSecondary">
        {t('caisse.entry.postingsHelp')}
      </Txt>
      <Txt variant="secondary" color="textSecondary">
        {t('common.labelValue', { label: t('caisse.entry.hash'), value: entry.hash })}
      </Txt>
      <Txt variant="secondary" color="textSecondary">
        {t('common.labelValue', {
          label: t('caisse.entry.prevHash'),
          value: entry.prevHash ?? '—',
        })}
      </Txt>
      <Txt variant="secondary" color="textSecondary">
        {t('caisse.entry.hashHelp')}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.s3 },
  flush: { marginHorizontal: -space.s4 },
});
