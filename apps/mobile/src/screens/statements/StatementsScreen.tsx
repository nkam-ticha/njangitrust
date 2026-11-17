// Relevés (spec 1.4 Statements, 2.14): a member's statements for a month, a cycle or custom dates. The
// PDF opens from a signed link valid 5 minutes; each statement carries the code an institution checks.
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CircleAlert } from 'lucide-react-native';
import { formatDateShort, formatMonthYear } from '@njangi/shared';
import type { StatementDto, StatementPeriodRequest } from '@njangi/shared/contracts/statements';
import { space } from '@/theme';
import {
  AppHeader,
  BottomSheet,
  Button,
  ChoiceRow,
  DateField,
  EmptyState,
  GroupedList,
  ListRow,
  SectionHeader,
  SkeletonRows,
  Txt,
  useLang,
} from '@/ui';
import { useActiveGroup } from '@/features/groups/useGroups';
import {
  useCreateStatement,
  useStatementDownload,
  useStatements,
} from '@/features/statements/useStatements';
import { errorMessage } from '@/features/errors/errorMessage';
import { doualaDay } from '../shared/doualaDay';
import { Screen } from '../shared/Screen';

type PeriodKind = 'MONTH' | 'CYCLE' | 'CUSTOM';

export function StatementsScreen() {
  const { t } = useTranslation();
  const lang = useLang();
  const router = useRouter();
  const { group } = useActiveGroup();
  const groupId = group?.groupId ?? null;
  const statements = useStatements(groupId);
  const download = useStatementDownload();
  const [creating, setCreating] = useState(false);
  const [latest, setLatest] = useState<StatementDto | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const left =
    !!group && (group.membershipStatus === 'LEFT' || group.membershipStatus === 'REMOVED');

  const open = (statement: StatementDto) => {
    download.mutate(statement.id, {
      onSuccess: ({ url }) => void Linking.openURL(url),
      // The signed link is short-lived and personal: it is not kept once opened.
      onSettled: () => download.reset(),
    });
  };

  return (
    <Screen
      header={<AppHeader kind="pushed" title={t('statements.title')} onBack={back} />}
      footer={
        groupId && !left ? (
          <Button fullWidth label={t('statements.generate')} onPress={() => setCreating(true)} />
        ) : undefined
      }
    >
      {left ? <Txt color="textSecondary">{t('statements.leftMember')}</Txt> : null}
      {statements.isPending ? <SkeletonRows rows={3} /> : null}
      {statements.isError ? (
        <EmptyState
          icon={CircleAlert}
          title={t('emptyStates.loadFailed.title')}
          body={errorMessage(statements.error, t, lang)}
          actionLabel={t('common.actions.retry')}
          onAction={() => void statements.refetch()}
        />
      ) : null}
      {statements.isSuccess && !statements.data.length ? (
        <Txt color="textSecondary">{t('statements.empty')}</Txt>
      ) : null}
      {statements.data?.length ? (
        <>
          <SectionHeader inset={false} title={t('statements.title')} />
          <View style={{ marginHorizontal: -space.s4 }}>
            <GroupedList>
              {statements.data.map((s) => (
                <ListRow
                  key={s.id}
                  titleWeight="regular"
                  title={t('statements.names.custom', {
                    from: formatDateShort(s.period.start, lang),
                    // The period ends at midnight after its last day: show that last day.
                    to: formatDateShort(new Date(Date.parse(s.period.end) - 1).toISOString(), lang),
                  })}
                  subtitle={`${t('statements.verificationCode', { code: s.verificationCode })} · ${t('statements.verifyHelp', { url: s.verifyAddress })}`}
                  trailing={
                    <Txt variant="captionStrong" color="textLink">
                      {t('common.actions.open')}
                    </Txt>
                  }
                  onPress={() => open(s)}
                />
              ))}
            </GroupedList>
          </View>
        </>
      ) : null}
      {latest ? (
        <View style={{ gap: space.s2 }}>
          <Txt variant="sectionTitle">{t('statements.ready')}</Txt>
          <Txt variant="secondary" color="textSecondary">
            {t('statements.verificationCode', { code: latest.verificationCode })}
          </Txt>
          <Button
            variant="secondary"
            fullWidth
            label={t('common.actions.open')}
            onPress={() => open(latest)}
          />
        </View>
      ) : null}
      {download.error ? (
        <Txt variant="secondary" color="textDanger">
          {errorMessage(download.error, t, lang)}
        </Txt>
      ) : null}

      <BottomSheet
        visible={creating}
        onClose={() => setCreating(false)}
        title={t('statements.periodTitle')}
      >
        {creating && groupId ? (
          <PeriodForm
            groupId={groupId}
            onCreated={(statement) => {
              setLatest(statement);
              setCreating(false);
            }}
          />
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

/** The last twelve months, from today in Douala (the period's month is a Douala month, spec 2.14). */
function recentMonths(today: string): { year: number; month: number }[] {
  const [year, month] = today.split('-').map(Number) as [number, number];
  return Array.from({ length: 12 }, (_, i) => {
    const index = year * 12 + (month - 1) - i;
    return { year: Math.floor(index / 12), month: (index % 12) + 1 };
  });
}

function PeriodForm({
  groupId,
  onCreated,
}: {
  groupId: string;
  onCreated: (statement: StatementDto) => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const create = useCreateStatement(groupId);
  const [today] = useState(() => doualaDay(new Date(Date.now())));
  const [kind, setKind] = useState<PeriodKind>('MONTH');
  const [month, setMonth] = useState<{ year: number; month: number } | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);

  const period: StatementPeriodRequest | null =
    kind === 'MONTH'
      ? month
        ? { kind: 'MONTH', year: month.year, month: month.month }
        : null
      : kind === 'CYCLE'
        ? { kind: 'CYCLE' }
        : from && to
          ? { kind: 'CUSTOM', from, to }
          : null;

  return (
    <View style={{ gap: space.s3 }}>
      <Txt variant="secondary" color="textSecondary">
        {t('statements.contents')}
      </Txt>
      {(['MONTH', 'CYCLE', 'CUSTOM'] as const).map((k) => (
        <ChoiceRow
          key={k}
          label={t(
            `statements.periods.${k === 'MONTH' ? 'month' : k === 'CYCLE' ? 'cycle' : 'custom'}`,
          )}
          selected={kind === k}
          onPress={() => setKind(k)}
        />
      ))}
      {kind === 'MONTH'
        ? recentMonths(today).map((m) => (
            <ChoiceRow
              key={`${m.year}-${m.month}`}
              label={formatMonthYear(m.year, m.month, lang)}
              selected={month?.year === m.year && month.month === m.month}
              onPress={() => setMonth(m)}
            />
          ))
        : null}
      {kind === 'CUSTOM' ? (
        <>
          <DateField label={t('statements.from')} value={from} onChange={setFrom} today={today} />
          <DateField
            label={t('statements.to')}
            value={to}
            onChange={setTo}
            minDay={from ?? undefined}
            today={today}
          />
        </>
      ) : null}
      {create.error ? (
        <Txt variant="secondary" color="textDanger">
          {errorMessage(create.error, t, lang)}
        </Txt>
      ) : null}
      <Button
        fullWidth
        label={create.isPending ? t('statements.generating') : t('common.actions.continue')}
        loading={create.isPending}
        disabled={!period || create.isPending}
        onPress={() => {
          if (!period) return;
          create.mutate(period, { onSuccess: onCreated });
        }}
      />
    </View>
  );
}
