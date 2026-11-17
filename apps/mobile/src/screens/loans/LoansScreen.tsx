// Loans (spec 1.4 Loans, R7, FSD LOA-01..03): my loan and its repayments, a request with a quote, and
// the admin's queue. A simulation (quote) moves nothing; a request, a decision and a repayment each come
// back as a card the member confirms (spec 4.5). The admin never decides a loan of their own.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CircleAlert } from 'lucide-react-native';
import { formatDateShort, formatXAF } from '@njangi/shared';
import type { PendingActionDto } from '@njangi/shared/contracts/pending-actions';
import { space } from '@/theme';
import {
  AmountInput,
  AmountText,
  AppHeader,
  Banner,
  BottomSheet,
  Button,
  ChoiceRow,
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
  useLoanDecision,
  useLoanQuote,
  useLoanRepayment,
  useLoans,
  useRefreshLoans,
  useRequestLoan,
  type LoanDto,
  type LoanQuoteDto,
} from '@/features/loans/useLoans';
import { errorMessage } from '@/features/errors/errorMessage';
import { ActionCard } from '../shared/ActionCard';
import { Screen } from '../shared/Screen';

const ACTIVE = ['REQUESTED', 'APPROVED', 'DISBURSED', 'OVERDUE'] as const;
const OPEN_FOR_REPAYMENT = ['DISBURSED', 'OVERDUE'] as const;
const MONTHS = [1, 2, 3] as const;

/** The quote's refusal codes, mapped to the designer's copy. */
const REFUSAL_KEY: Record<string, string> = {
  ACTIVE_LOAN_EXISTS: 'loans.notEligible.activeLoan',
  OVERDUE_DEBT: 'loans.notEligible.overdueDebt',
  MEMBER_LEAVING: 'loans.notEligible.leaving',
  NOT_ACTIVE_MEMBER: 'loans.notEligible.notActive',
};

export function LoansScreen() {
  const { t } = useTranslation();
  const lang = useLang();
  const router = useRouter();
  const { group } = useActiveGroup();
  const groupId = group?.groupId ?? null;
  const loans = useLoans(groupId);
  const refresh = useRefreshLoans(groupId);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const header = <AppHeader kind="pushed" title={t('loans.title')} onBack={back} />;
  if (!group) {
    return (
      <Screen header={header}>
        <EmptyState
          icon={CircleAlert}
          title={t('loans.title')}
          body={t('emptyStates.noGroup.body')}
        />
      </Screen>
    );
  }
  if (loans.isPending) {
    return (
      <Screen header={header}>
        <SkeletonRows rows={4} />
      </Screen>
    );
  }
  if (loans.isError) {
    return (
      <Screen header={header}>
        <EmptyState
          icon={CircleAlert}
          title={t('emptyStates.loadFailed.title')}
          body={errorMessage(loans.error, t, lang)}
          actionLabel={t('common.actions.retry')}
          onAction={() => void loans.refetch()}
        />
      </Screen>
    );
  }

  const list = loans.data;
  const mine = list.find(
    (l) =>
      l.borrower.membershipId === group.membershipId &&
      (ACTIVE as readonly string[]).includes(l.status),
  );
  const admin = group.role === 'ADMIN';
  const queue = admin
    ? list.filter((l) => l.status === 'REQUESTED' && l.borrower.membershipId !== group.membershipId)
    : [];

  return (
    <Screen header={header}>
      <SectionHeader inset={false} title={t('loans.mine.title')} />
      {mine ? (
        <MyLoan loan={mine} groupId={groupId} onChanged={refresh} />
      ) : (
        <Txt color="textSecondary">{t('loans.mine.none')}</Txt>
      )}

      {!mine ? <RequestForm groupId={groupId} onRequested={refresh} /> : null}

      {admin ? (
        <>
          <SectionHeader inset={false} title={t('loans.queue.title')} />
          {queue.length ? (
            <View style={styles.flush}>
              <GroupedList>
                {queue.map((loan) => (
                  <QueueRow key={loan.id} loan={loan} onDecided={refresh} lang={lang} />
                ))}
              </GroupedList>
            </View>
          ) : (
            <Txt color="textSecondary">{t('loans.queue.empty')}</Txt>
          )}
        </>
      ) : null}
    </Screen>
  );
}

function MyLoan({
  loan,
  groupId,
  onChanged,
}: {
  loan: LoanDto;
  groupId: string | null;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const online = useConnectivity((s) => s.online);
  const repay = useLoanRepayment(groupId);
  const [action, setAction] = useState<PendingActionDto | null>(null);
  const next = loan.installments.find((i) => i.status === 'DUE');
  const canRepay = (OPEN_FOR_REPAYMENT as readonly string[]).includes(loan.status);

  return (
    <View style={styles.column}>
      <Txt>{t(`loans.status.${loan.status}`)}</Txt>
      <AmountText amount={loan.principal} size="large" align="left" />
      {loan.totalDue !== null ? (
        <Txt color="textSecondary">
          {t('common.labelOnly', { label: t('loans.request.breakdownTitle') })}{' '}
          <AmountText amount={loan.totalDue} size="small" />
        </Txt>
      ) : null}
      {loan.decisionReason ? (
        <Txt variant="secondary" color="textSecondary">
          {t('loans.rejectedReason', { reason: loan.decisionReason })}
        </Txt>
      ) : null}
      {next ? (
        <Txt color="textSecondary">
          {t('loans.mine.nextInstallment', {
            amount: formatXAF(next.amount, lang),
            date: formatDateShort(next.dueAt, lang),
          })}
        </Txt>
      ) : null}
      {loan.status === 'OVERDUE' && next ? (
        <Banner
          kind="error"
          text={t('loans.mine.overdue', { date: formatDateShort(next.dueAt, lang) })}
        />
      ) : null}
      {loan.installments.length ? (
        <View style={styles.flush}>
          <GroupedList>
            {loan.installments.map((item) => (
              <ListRow
                key={item.id}
                titleWeight="regular"
                title={formatDateShort(item.dueAt, lang)}
                subtitle={
                  item.status === 'PAID'
                    ? t('loans.mine.paidRow', { date: formatDateShort(item.dueAt, lang) })
                    : t('loans.mine.dueRow', { date: formatDateShort(item.dueAt, lang) })
                }
                trailing={<AmountText amount={item.amount} size="small" />}
              />
            ))}
          </GroupedList>
        </View>
      ) : null}
      {canRepay ? (
        <>
          <Txt variant="secondary" color="textSecondary">
            {t('loans.mine.repayEarlyNote')}
          </Txt>
          {action ? (
            <ActionCard
              action={action}
              onConfirmed={onChanged}
              onCancelled={() => setAction(null)}
              onClose={() => setAction(null)}
            />
          ) : (
            <Button
              fullWidth
              label={t('loans.mine.repayNow')}
              loading={repay.isPending}
              offline={!online}
              disabled={repay.isPending}
              onPress={() =>
                repay.mutate(loan.id, { onSuccess: (prepared) => setAction(prepared) })
              }
            />
          )}
          {repay.error ? (
            <Txt variant="secondary" color="textDanger">
              {errorMessage(repay.error, t, lang)}
            </Txt>
          ) : null}
        </>
      ) : null}
      <Txt variant="secondary" color="textSecondary">
        {t('loans.mine.autoSettlementNote')}
      </Txt>
    </View>
  );
}

function RequestForm({
  groupId,
  onRequested,
}: {
  groupId: string | null;
  onRequested: () => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const online = useConnectivity((s) => s.online);
  const quote = useLoanQuote(groupId);
  const request = useRequestLoan(groupId);
  const [amount, setAmount] = useState<number | null>(null);
  const [months, setMonths] = useState<number>(1);
  const [result, setResult] = useState<LoanQuoteDto | null>(null);
  const [action, setAction] = useState<PendingActionDto | null>(null);
  const ok = result && result.ok ? result : null;
  const refusal = result && !result.ok ? result : null;

  const reason = refusal
    ? REFUSAL_KEY[refusal.code]
      ? t(REFUSAL_KEY[refusal.code] as 'loans.notEligible.activeLoan')
      : refusal.limit === 0
        ? t('loans.notEligible.zeroLimit')
        : refusal.code === 'LOAN_ABOVE_LIMIT' && refusal.limit !== undefined
          ? t('loans.request.limit', { amount: formatXAF(refusal.limit, lang) })
          : null
    : null;

  return (
    <View style={styles.column}>
      <SectionHeader inset={false} title={t('loans.request.title')} />
      <AmountInput
        label={t('loans.request.amount')}
        value={amount}
        onChange={(v) => {
          setAmount(v);
          setResult(null);
        }}
      />
      <Txt variant="sectionTitle">{t('loans.request.months')}</Txt>
      {MONTHS.map((m) => (
        <ChoiceRow
          key={m}
          label={t('loans.request.monthsOption', { count: m })}
          selected={months === m}
          onPress={() => {
            setMonths(m);
            setResult(null);
          }}
        />
      ))}
      <Button
        variant="secondary"
        fullWidth
        label={t('loans.request.quote')}
        loading={quote.isPending}
        offline={!online}
        disabled={amount === null || quote.isPending}
        onPress={() => {
          if (amount === null) return;
          quote.mutate({ amount, months }, { onSuccess: (q) => setResult(q) });
        }}
      />
      {quote.error ? (
        <Txt variant="secondary" color="textDanger">
          {errorMessage(quote.error, t, lang)}
        </Txt>
      ) : null}
      {reason ? <Banner kind="info" text={reason} /> : null}

      {ok ? (
        <View style={styles.column}>
          <Txt color="textSecondary">
            {t('loans.request.limit', { amount: formatXAF(ok.limit, lang) })}
          </Txt>
          <View style={styles.flush}>
            <GroupedList>
              <ListRow
                titleWeight="regular"
                title={t('caisse.breakdown.fees')}
                trailing={<AmountText amount={ok.feeEstimate} size="small" />}
              />
              <ListRow
                titleWeight="regular"
                title={t('loans.request.breakdownTitle')}
                trailing={<AmountText amount={ok.totalDue} size="small" />}
              />
              {ok.installments.map((item) => (
                <ListRow
                  key={item.number}
                  titleWeight="regular"
                  title={t('loans.request.installmentRow', { n: item.number })}
                  subtitle={
                    item.due.status === 'DATED'
                      ? formatDateShort(item.due.dueAt, lang)
                      : t('loans.request.nextCycle')
                  }
                  trailing={<AmountText amount={item.amount} size="small" />}
                />
              ))}
            </GroupedList>
          </View>
          {action ? (
            <ActionCard
              action={action}
              onConfirmed={() => {
                onRequested();
                setAction(null);
                setResult(null);
              }}
              onCancelled={() => setAction(null)}
              onClose={() => setAction(null)}
            />
          ) : (
            <Button
              fullWidth
              label={t('loans.request.prepare')}
              loading={request.isPending}
              offline={!online}
              disabled={request.isPending || amount === null}
              onPress={() => {
                if (amount === null) return;
                request.mutate(
                  { amount, months },
                  { onSuccess: (prepared) => setAction(prepared) },
                );
              }}
            />
          )}
          <Txt variant="secondary" color="textSecondary">
            {t('loans.request.adminDecides')}
          </Txt>
        </View>
      ) : null}
      {request.error ? (
        <Txt variant="secondary" color="textDanger">
          {errorMessage(request.error, t, lang)}
        </Txt>
      ) : null}
    </View>
  );
}

function QueueRow({
  loan,
  onDecided,
  lang,
}: {
  loan: LoanDto;
  onDecided: () => void;
  lang: 'fr' | 'en';
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <ListRow
        title={loan.borrower.name}
        subtitle={t('loans.queue.requestedAt', { date: formatDateShort(loan.createdAt, lang) })}
        trailing={<AmountText amount={loan.principal} size="small" />}
        chevron
        onPress={() => setOpen(true)}
      />
      <BottomSheet visible={open} onClose={() => setOpen(false)} title={t('loans.queue.title')}>
        {open ? (
          <DecisionSheet
            loan={loan}
            onDone={() => {
              setOpen(false);
              onDecided();
            }}
          />
        ) : null}
      </BottomSheet>
    </>
  );
}

/** The admin's decision: approving or refusing prepares a card; a refusal needs a reason (spec R7). */
function DecisionSheet({ loan, onDone }: { loan: LoanDto; onDone: () => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const online = useConnectivity((s) => s.online);
  const decide = useLoanDecision();
  const [reason, setReason] = useState('');
  const [refusing, setRefusing] = useState(false);
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
  const decideWith = (kind: 'approve' | 'reject') => {
    const text = reason.trim();
    if (kind === 'reject' && !text) {
      setRefusing(true);
      return;
    }
    decide.mutate(
      {
        loanId: loan.id,
        decision: kind,
        reason: text || t('loans.queue.approveReason'),
      },
      { onSuccess: (prepared) => setAction(prepared) },
    );
  };
  return (
    <View style={styles.column}>
      <AmountText amount={loan.principal} size="large" align="left" />
      <Txt color="textSecondary">{loan.borrower.name}</Txt>
      <TextField
        label={t('loans.queue.reasonLabel')}
        helper={refusing ? t('loans.queue.reasonRequired') : t('loans.queue.reasonHelp')}
        error={refusing && !reason.trim() ? t('loans.queue.reasonRequired') : null}
        value={reason}
        onChangeText={setReason}
        maxLength={500}
      />
      {decide.error ? (
        <Txt variant="secondary" color="textDanger">
          {errorMessage(decide.error, t, lang)}
        </Txt>
      ) : null}
      <View style={styles.actions}>
        <Button
          fullWidth
          label={t('loans.queue.approve')}
          offline={!online}
          loading={decide.isPending}
          disabled={decide.isPending}
          onPress={() => decideWith('approve')}
        />
        <Button
          fullWidth
          variant="secondary"
          label={t('loans.queue.reject')}
          offline={!online}
          disabled={decide.isPending}
          onPress={() => decideWith('reject')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.s3 },
  actions: { gap: space.s2 },
  flush: { marginHorizontal: -space.s4 },
});
