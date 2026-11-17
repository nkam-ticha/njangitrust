// S-07 Create a group (SCREENS.md; GRP-01, D13.2): name, payout schedule with the monthly anchor,
// contributions, the 3.2 rules prefilled and editable, summary. Then the founding members (S-08).
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react-native';
import { monthlyAnchorFromFirstPayout, roundPayoutAt } from '@njangi/rules';
import { formatDateLong, formatDateTime, formatXAF, toDouala } from '@njangi/shared';
import type { RuleSetParamsDto } from '@njangi/shared/contracts/groups';
import { space, useTheme } from '@/theme';
import {
  AmountInput,
  Button,
  ChoiceRow,
  DateField,
  GroupedList,
  ListRow,
  TextField,
  TimeField,
  Touchable,
  Txt,
  useLang,
} from '@/ui';
import { useCreateGroup } from '@/features/groups/useGroups';
import { AMOUNT_RANGES, DEFAULT_RULES, type RuleName } from '@/features/groups/ruleFormat';
import { MAX_CUSTOM_PERIOD_MINUTES, MIN_CUSTOM_PERIOD_MINUTES } from '@njangi/rules';
import { errorMessage } from '@/features/errors/errorMessage';
import { RulesList } from '../shared/RulesList';
import { Screen } from '../shared/Screen';
import { CustomPeriodField } from './CustomPeriodField';
import { RuleEditSheet } from './RuleEditSheet';

type Step = 'name' | 'schedule' | 'money' | 'rules' | 'summary';
type Anchor = 'DAY_OF_MONTH' | 'LAST_WEEKDAY' | 'NTH_WEEKDAY';
const STEPS: Step[] = ['name', 'schedule', 'money', 'rules', 'summary'];
const pad = (n: number) => String(n).padStart(2, '0');
/** Shortcuts for the contribution; any amount from the minimum up can be typed. */
const QUICK_CONTRIBUTIONS = [25, 100, 500, 1_000, 5_000, 10_000];

/** The anchors a chosen day allows (D13.2): its day number, the nth weekday (1 to 4), the last weekday. */
function anchorsFor(day: string): Anchor[] {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const list: Anchor[] = ['DAY_OF_MONTH'];
  if (Math.ceil(d / 7) <= 4) list.push('NTH_WEEKDAY');
  if (d + 7 > daysInMonth) list.push('LAST_WEEKDAY');
  return list;
}

export function CreateGroupScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const lang = useLang();
  const router = useRouter();
  const create = useCreateGroup();
  // Today's date and the time of day in Douala, read once when the screen opens.
  const { today, nowTime } = useMemo(() => {
    const p = toDouala(new Date());
    return {
      today: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
      nowTime: `${pad(p.hour)}:${pad(p.minute)}`,
    };
  }, []);
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [day, setDay] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>('18:00');
  const [anchor, setAnchor] = useState<Anchor>('DAY_OF_MONTH');
  const [rules, setRules] = useState<Omit<RuleSetParamsDto, 'payoutTime'>>({ ...DEFAULT_RULES });
  const [editing, setEditing] = useState<RuleName | null>(null);

  const index = STEPS.indexOf(step);
  const firstPayoutAt = day && time ? new Date(`${day}T${time}:00+01:00`).toISOString() : null;
  // R2.2 and D13.2: the first two payout dates, computed by the rules engine (display only).
  const anchor0 = anchor;
  const preview = useMemo(() => {
    if (!firstPayoutAt) return null;
    const first = new Date(firstPayoutAt);
    const fixed =
      rules.frequency === 'MONTHLY' ? monthlyAnchorFromFirstPayout(first, anchor0) : null;
    const schedule = {
      firstPayoutAt: first,
      frequency: rules.frequency,
      customPeriodMinutes: rules.customPeriodMinutes,
      monthlyAnchor: fixed && fixed.ok ? fixed.anchor : undefined,
    };
    return {
      first: formatDateTime(first, lang),
      second: formatDateTime(roundPayoutAt(schedule, 2), lang),
    };
  }, [firstPayoutAt, rules.frequency, rules.customPeriodMinutes, anchor0, lang]);
  const weekday = day ? (formatDateLong(`${day}T12:00:00Z`, lang).split(' ')[0] ?? '') : '';
  const dayNumber = day ? Number(day.slice(8)) : 0;
  const anchorLabel = (a: Anchor) =>
    a === 'DAY_OF_MONTH'
      ? t('createGroup.schedule.anchor.dayOfMonth', { day: dayNumber })
      : a === 'LAST_WEEKDAY'
        ? t('createGroup.schedule.anchor.lastWeekday', { weekday })
        : t('createGroup.schedule.anchor.nthWeekday', {
            weekday,
            nth: t(
              `createGroup.schedule.anchor.nth${Math.min(4, Math.ceil(dayNumber / 7)) as 1 | 2 | 3 | 4}`,
            ),
          });

  const amountOk = (n: 'contributionAmount' | 'solidarityContribution') =>
    rules[n] >= AMOUNT_RANGES[n][0] && rules[n] <= AMOUNT_RANGES[n][1];
  // A custom period can start within the hour (D23): the first payout only has to be in the future.
  // The fixed frequencies keep their rule of a first payout on a later day.
  const custom = rules.frequency === 'CUSTOM';
  const customOk =
    rules.customPeriodMinutes >= MIN_CUSTOM_PERIOD_MINUTES &&
    rules.customPeriodMinutes <= MAX_CUSTOM_PERIOD_MINUTES;
  const scheduleOk =
    !!firstPayoutAt &&
    (custom ? customOk && (day! > today || (day === today && time! > nowTime)) : day! > today);
  const canContinue =
    (step === 'name' && name.trim().length >= 2) ||
    (step === 'schedule' && scheduleOk) ||
    (step === 'money' && amountOk('contributionAmount') && amountOk('solidarityContribution')) ||
    step === 'rules';

  const submit = () => {
    if (!firstPayoutAt) return;
    const { frequency, ...rest } = rules;
    create.mutate(
      {
        name: name.trim(),
        firstPayoutAt,
        monthlyAnchor: frequency === 'MONTHLY' ? anchor : undefined,
        rules: { frequency, ...rest },
      },
      { onSuccess: () => router.replace('/founding') },
    );
  };

  const header = (
    <View style={styles.head}>
      <Touchable
        onPress={() => (index === 0 ? router.back() : setStep(STEPS[index - 1]!))}
        radius={24}
        accessibilityRole="button"
        accessibilityLabel={t('common.actions.back')}
        style={styles.back}
      >
        <ArrowLeft size={24} color={colors.iconPrimary} strokeWidth={2} />
      </Touchable>
      <Txt variant="secondary" color="textSecondary">
        {t('common.stepOf', { current: index + 1, total: STEPS.length })}
      </Txt>
    </View>
  );
  const footer =
    step === 'summary' ? (
      <>
        {create.error ? (
          <Txt variant="secondary" color="textDanger" accessibilityLiveRegion="assertive">
            {errorMessage(create.error, t, lang)}
          </Txt>
        ) : null}
        <Button
          fullWidth
          label={
            create.isPending ? t('createGroup.summary.creating') : t('createGroup.summary.create')
          }
          loading={create.isPending}
          onPress={submit}
        />
      </>
    ) : (
      <Button
        fullWidth
        label={t('common.actions.continue')}
        disabled={!canContinue}
        onPress={() => setStep(STEPS[index + 1]!)}
      />
    );

  return (
    <Screen width="form" header={header} footer={footer}>
      {step === 'name' ? (
        <>
          <Txt variant="screenTitle" accessibilityRole="header">
            {t('createGroup.name.title')}
          </Txt>
          <TextField
            label={t('createGroup.name.label')}
            placeholder={t('createGroup.name.placeholder')}
            helper={t('createGroup.name.help')}
            value={name}
            onChangeText={setName}
            maxLength={80}
            autoFocus
          />
        </>
      ) : null}
      {step === 'schedule' ? (
        <>
          <Txt variant="screenTitle" accessibilityRole="header">
            {t('createGroup.schedule.title')}
          </Txt>
          <DateField
            label={t('createGroup.schedule.firstPayout')}
            value={day}
            onChange={(d) => {
              setDay(d);
              setAnchor('DAY_OF_MONTH');
            }}
            today={today}
            minDay={today}
            error={
              day && (custom ? day < today : day <= today)
                ? t('errors.validation.dateInPast')
                : null
            }
          />
          <TimeField label={t('createGroup.schedule.time')} value={time} onChange={setTime} />
          <Txt variant="secondaryStrong">{t('createGroup.schedule.frequency')}</Txt>
          {(['MONTHLY', 'BIWEEKLY', 'WEEKLY', 'CUSTOM'] as const).map((f) => (
            <ChoiceRow
              key={f}
              label={t(`common.frequency.${f}`)}
              selected={rules.frequency === f}
              onPress={() => setRules({ ...rules, frequency: f })}
            />
          ))}
          {custom ? (
            <CustomPeriodField
              value={rules.customPeriodMinutes}
              onChange={(minutes) => setRules({ ...rules, customPeriodMinutes: minutes })}
            />
          ) : null}
          {custom && firstPayoutAt && !scheduleOk && customOk ? (
            <Txt variant="secondary" color="textDanger">
              {t('createGroup.schedule.custom.today')}
            </Txt>
          ) : null}
          {rules.frequency === 'MONTHLY' && day ? (
            <>
              <Txt variant="secondaryStrong">{t('createGroup.schedule.anchor.title')}</Txt>
              {anchorsFor(day).map((a) => (
                <ChoiceRow
                  key={a}
                  label={anchorLabel(a)}
                  selected={anchor === a}
                  onPress={() => setAnchor(a)}
                />
              ))}
              {anchor === 'DAY_OF_MONTH' && dayNumber > 28 ? (
                <Txt variant="secondary" color="textSecondary">
                  {t('createGroup.schedule.anchor.clampNote')}
                </Txt>
              ) : null}
            </>
          ) : null}
          {preview ? (
            <Txt variant="secondary">{t('createGroup.schedule.preview', preview)}</Txt>
          ) : null}
          <Txt variant="secondary" color="textSecondary">
            {custom
              ? t('createGroup.schedule.custom.deadlineNote')
              : t('createGroup.schedule.deadlineNote')}
          </Txt>
        </>
      ) : null}
      {step === 'money' ? (
        <>
          <Txt variant="screenTitle" accessibilityRole="header">
            {t('createGroup.money.title')}
          </Txt>
          <AmountInput
            label={t('createGroup.money.contribution')}
            value={rules.contributionAmount}
            onChange={(v) => setRules({ ...rules, contributionAmount: v ?? 0 })}
            min={AMOUNT_RANGES.contributionAmount[0]}
            max={AMOUNT_RANGES.contributionAmount[1]}
            quick={QUICK_CONTRIBUTIONS.map((amount) => ({
              label: formatXAF(amount, lang),
              amount,
            }))}
          />
          <AmountInput
            label={t('createGroup.money.solidarity')}
            value={rules.solidarityContribution}
            onChange={(v) => setRules({ ...rules, solidarityContribution: v ?? 0 })}
            min={0}
            max={AMOUNT_RANGES.solidarityContribution[1]}
            helper={t('createGroup.money.solidarityHelp')}
          />
        </>
      ) : null}
      {step === 'rules' ? (
        <>
          <Txt variant="screenTitle" accessibilityRole="header">
            {t('createGroup.rules.title')}
          </Txt>
          <Txt color="textSecondary">{t('createGroup.rules.body')}</Txt>
          <View style={styles.flush}>
            <RulesList
              params={rules}
              hide={[
                'contributionAmount',
                'solidarityContribution',
                'frequency',
                'customPeriodMinutes',
              ]}
              onEdit={setEditing}
            />
          </View>
        </>
      ) : null}
      {step === 'summary' && firstPayoutAt ? (
        <>
          <Txt variant="screenTitle" accessibilityRole="header">
            {t('createGroup.summary.title')}
          </Txt>
          <View style={styles.flush}>
            <GroupedList>
              <ListRow
                title={t('createGroup.name.label')}
                titleWeight="regular"
                trailing={<Txt variant="bodyStrong">{name.trim()}</Txt>}
              />
              <ListRow
                title={t('createGroup.schedule.firstPayout')}
                titleWeight="regular"
                subtitle={formatDateTime(firstPayoutAt, lang, { withYear: true })}
              />
              {rules.frequency === 'MONTHLY' ? (
                <ListRow
                  title={t('createGroup.schedule.anchor.title')}
                  titleWeight="regular"
                  subtitle={anchorLabel(anchor)}
                />
              ) : null}
            </GroupedList>
          </View>
          <View style={styles.flush}>
            <RulesList params={rules} />
          </View>
          <Txt variant="secondary" color="textSecondary">
            {t('createGroup.summary.adminNote')}
          </Txt>
        </>
      ) : null}
      <RuleEditSheet
        name={editing}
        value={editing ? rules[editing] : null}
        onClose={() => setEditing(null)}
        onSave={(n, v) => {
          setRules({ ...rules, [n]: v });
          setEditing(null);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s2,
    paddingHorizontal: space.s1,
    minHeight: 56,
  },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  flush: { marginHorizontal: -space.s4 },
});
