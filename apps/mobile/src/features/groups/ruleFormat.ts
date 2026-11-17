// Rule labels, values and edit choices for the 3.2 parameters (invitation preview, create a group,
// group settings). Defaults and ranges come from @njangi/rules; the server validates every value.
import type { TFunction } from 'i18next';
import { DEFAULT_RULE_SET, PARAMETER_SPECS, splitPeriod } from '@njangi/rules';
import { formatXAF, type Lang } from '@njangi/shared';
import type { RuleSetParamsDto } from '@njangi/shared/contracts/groups';

export type RuleName = Exclude<keyof RuleSetParamsDto, 'payoutTime'>;
type Editable = Exclude<
  RuleName,
  'contributionAmount' | 'solidarityContribution' | 'frequency' | 'customPeriodMinutes'
>;

/** 3.2 defaults (payout time comes from the first payout chosen in the form). */
const { payoutTime: _defaultPayoutTime, ...defaults } = DEFAULT_RULE_SET;
export const DEFAULT_RULES: Omit<RuleSetParamsDto, 'payoutTime'> = defaults;

function range(
  name:
    'contributionAmount' | 'solidarityContribution' | 'lateFine' | 'minBid' | 'meetingAbsenceFine',
): readonly [number, number] {
  const spec = PARAMETER_SPECS[name];
  return spec.kind === 'integer' ? [spec.min, spec.max] : [0, 0];
}

/** Integer ranges for amounts (3.2). */
export const AMOUNT_RANGES = {
  contributionAmount: range('contributionAmount'),
  solidarityContribution: range('solidarityContribution'),
  lateFine: range('lateFine'),
  minBid: range('minBid'),
  meetingAbsenceFine: range('meetingAbsenceFine'),
} as const;
export type AmountRule = keyof typeof AMOUNT_RANGES;

/** Choices offered when editing a non-amount rule, inside its 3.2 range. */
export const RULE_CHOICES: Record<
  Exclude<Editable, AmountRule>,
  ReadonlyArray<number | string | boolean>
> = {
  rotationMode: ['FIXED', 'BIDDING'],
  loanRatePermille: [0, 20, 30, 50, 70, 100],
  loanMaxMonths: [1, 2, 3, 4, 5, 6],
  loanLimitFactorPermille: [500, 1_000, 1_500, 2_000, 3_000],
  numberChangeHoldHours: [0, 24, 48, 72, 168],
  voteWindowHours: [24, 48, 72, 120, 168],
  solidarityVoteWindowHours: [12, 24, 48, 72],
  distributeFundAtCycleEnd: [true, false],
  reliabilityWindow: [6, 12, 18, 24],
};

/** The order rules are listed in (create a group step 4, invitation, settings). */
export const RULE_ORDER: RuleName[] = [
  'contributionAmount',
  'solidarityContribution',
  'frequency',
  'customPeriodMinutes',
  'lateFine',
  'rotationMode',
  'minBid',
  'loanRatePermille',
  'loanMaxMonths',
  'loanLimitFactorPermille',
  'numberChangeHoldHours',
  'voteWindowHours',
  'solidarityVoteWindowHours',
  'meetingAbsenceFine',
  'distributeFundAtCycleEnd',
  'reliabilityWindow',
];

/** Copy key of each rule's label (loanLimitFactorPermille is the spec's loanLimitFactor). */
export function ruleLabel(name: RuleName, t: TFunction): string {
  return name === 'loanLimitFactorPermille'
    ? t('rules.loanLimitFactor.label')
    : t(`rules.${name}.label`);
}

/** Permille as a decimal string without floats: 50 → "5", 15 → "1,5" (fr) / "1.5" (en). */
export function permilleText(permille: number, divisor: 10 | 1000, lang: Lang): string {
  const whole = Math.floor(permille / divisor);
  const rest = permille % divisor;
  if (rest === 0) return String(whole);
  const digits = String(rest)
    .padStart(divisor === 10 ? 1 : 3, '0')
    .replace(/0+$/, '');
  return `${whole}${lang === 'fr' ? ',' : '.'}${digits}`;
}

/** "Every minute", "Every 5 minutes", "Every 2 hours", "Every 7 days" (a custom period, D23). */
export function periodText(minutes: number, t: TFunction): string {
  const { unit, count } = splitPeriod(minutes);
  switch (unit) {
    case 'minutes':
      return t('rules.values.everyMinutes', { count });
    case 'hours':
      return t('rules.values.everyHours', { count });
    case 'days':
      return t('rules.values.everyDays', { count });
  }
}

/** How often the rounds come, for a sentence: "every month", or "every 5 minutes" when custom. */
export function frequencyText(
  params: { frequency: RuleSetParamsDto['frequency']; customPeriodMinutes: number },
  t: TFunction,
  lang: Lang,
): string {
  return (
    params.frequency === 'CUSTOM'
      ? periodText(params.customPeriodMinutes, t)
      : t(`common.frequency.${params.frequency}`)
  ).toLocaleLowerCase(lang);
}

export function ruleValue(
  name: RuleName,
  value: number | string | boolean,
  t: TFunction,
  lang: Lang,
): string {
  switch (name) {
    case 'contributionAmount':
    case 'solidarityContribution':
    case 'lateFine':
    case 'minBid':
    case 'meetingAbsenceFine':
      return value === 0 && name !== 'contributionAmount'
        ? t('rules.values.off')
        : formatXAF(value as number, lang);
    case 'frequency':
      return t(`common.frequency.${value as 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'CUSTOM'}`);
    case 'customPeriodMinutes':
      return periodText(value as number, t);
    case 'rotationMode':
      return t(`common.rotationMode.${value as 'FIXED' | 'BIDDING'}`);
    case 'loanRatePermille':
      return t('common.percentPerMonth', { percent: permilleText(value as number, 10, lang) });
    case 'loanMaxMonths':
      return t('rules.values.months', { count: value as number });
    case 'loanLimitFactorPermille':
      return t('rules.values.factor', { factor: permilleText(value as number, 1000, lang) });
    case 'numberChangeHoldHours':
    case 'voteWindowHours':
    case 'solidarityVoteWindowHours':
      return t('rules.values.hours', { count: value as number });
    case 'distributeFundAtCycleEnd':
      return value ? t('rules.values.yes') : t('rules.values.no');
    case 'reliabilityWindow':
      return t('rules.values.items', { count: value as number });
    default:
      return String(value);
  }
}
