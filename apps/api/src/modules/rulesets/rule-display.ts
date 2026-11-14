// How a rule and its value read to members ("Amende de retard : 1 000 FCFA → 1 500 FCFA"), from
// the designer's copy (ui.*.ts `rules.*` and `common.*`). Amounts only through formatXAF.
import { formatLimitFactor, type ParameterName, type RuleSetParams } from '@njangi/rules';
import { formatXAF, type Bilingual, type Lang } from '@njangi/shared';
import type { UiCopyShape } from '@njangi/shared/i18n';
import { ui } from '../../lib/texts';

const MONEY: ReadonlySet<ParameterName> = new Set([
  'contributionAmount',
  'solidarityContribution',
  'lateFine',
  'minBid',
  'meetingAbsenceFine',
]);
const OFF_AT_ZERO: ReadonlySet<ParameterName> = new Set([
  'solidarityContribution',
  'meetingAbsenceFine',
]);
const HOURS: ReadonlySet<ParameterName> = new Set([
  'numberChangeHoldHours',
  'voteWindowHours',
  'solidarityVoteWindowHours',
]);

type RuleCopyKey = Exclude<keyof UiCopyShape['rules'], 'values'>;

/** The designer keys the factor rule by its member-facing name. */
function copyKey(parameter: ParameterName): RuleCopyKey {
  return parameter === 'loanLimitFactorPermille' ? 'loanLimitFactor' : parameter;
}

export function ruleLabel(parameter: ParameterName): Bilingual {
  return ui((c) => (c.rules[copyKey(parameter)] as { label: string }).label);
}

/** Permille as a percentage without floats: 50 -> "5", 55 -> "5,5" (fr) / "5.5" (en). */
function percent(permille: number, lang: Lang): string {
  const whole = Math.floor(permille / 10);
  const tenth = permille % 10;
  return tenth === 0 ? String(whole) : `${whole}${lang === 'fr' ? ',' : '.'}${tenth}`;
}

const pad = (n: number) => String(n).padStart(2, '0');
const plural = (n: number) => (n === 1 ? 'one' : 'other');

export function ruleValue<P extends ParameterName>(
  parameter: P,
  value: RuleSetParams[P],
): Bilingual {
  const v = value as unknown;
  if (typeof v === 'boolean') return ui((c) => (v ? c.rules.values.yes : c.rules.values.no));
  if (typeof v === 'number') {
    if (v === 0 && OFF_AT_ZERO.has(parameter)) return ui((c) => c.rules.values.off);
    if (MONEY.has(parameter)) return { fr: formatXAF(v, 'fr'), en: formatXAF(v, 'en') };
    if (HOURS.has(parameter)) return ui((c) => c.rules.values[`hours_${plural(v)}`], { count: v });
    if (parameter === 'loanMaxMonths')
      return ui((c) => c.rules.values[`months_${plural(v)}`], { count: v });
    if (parameter === 'reliabilityWindow')
      return ui((c) => c.rules.values[`items_${plural(v)}`], { count: v });
    if (parameter === 'loanRatePermille') {
      return ui((c) => c.common.percentPerMonth, {
        percent: { fr: percent(v, 'fr'), en: percent(v, 'en') },
      });
    }
    if (parameter === 'loanLimitFactorPermille') {
      return ui((c) => c.rules.values.factor, {
        factor: { fr: formatLimitFactor(v, 'fr'), en: formatLimitFactor(v, 'en') },
      });
    }
    return { fr: String(v), en: String(v) };
  }
  if (parameter === 'frequency')
    return ui((c) => c.common.frequency[v as RuleSetParams['frequency']]);
  if (parameter === 'rotationMode')
    return ui((c) => c.common.rotationMode[v as RuleSetParams['rotationMode']]);
  if (parameter === 'payoutTime') {
    const t = v as RuleSetParams['payoutTime'];
    const clock = `${pad(t.hour)}:${pad(t.minute)}`;
    return { fr: clock, en: clock };
  }
  return { fr: String(v), en: String(v) };
}

/** "Amende de retard : 1 000 FCFA → 1 500 FCFA" (votes.titles.ruleChange). */
export function ruleChangeTitle<P extends ParameterName>(
  parameter: P,
  from: RuleSetParams[P],
  to: RuleSetParams[P],
): Bilingual {
  return ui((c) => c.votes.titles.ruleChange, {
    rule: ruleLabel(parameter),
    from: ruleValue(parameter, from),
    to: ruleValue(parameter, to),
  });
}
