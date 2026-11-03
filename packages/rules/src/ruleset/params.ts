// Rule set parameters, defaults and allowed ranges (3.2, R11.7).

import type { Refusal } from '../result';
import type { Frequency, MonthlyAnchor, PayoutTime } from '../time';

export type RotationMode = 'FIXED' | 'BIDDING';

/** 3.2: a group's rule set. Money is in FCFA; rates are integers (permille) so no float enters. */
export interface RuleSetParams {
  contributionAmount: number;
  /** 0 turns the solidarity fund off. */
  solidarityContribution: number;
  frequency: Frequency;
  payoutTime: PayoutTime;
  lateFine: number;
  rotationMode: RotationMode;
  minBid: number;
  /** Monthly loan rate in permille: 50 = 5% per month. */
  loanRatePermille: number;
  loanMaxMonths: number;
  /** The spec's `loanLimitFactor` (0 to 3) in permille: 1000 = 1.0. */
  loanLimitFactorPermille: number;
  numberChangeHoldHours: number;
  voteWindowHours: number;
  solidarityVoteWindowHours: number;
  meetingAbsenceFine: number;
  distributeFundAtCycleEnd: boolean;
  reliabilityWindow: number;
}

export type ParameterName = keyof RuleSetParams;

/** R11.1: when a passed RULE_CHANGE applies. */
export type TakesEffect = 'NEXT_ROUND' | 'NEXT_CYCLE';

export type ParameterSpec =
  | { kind: 'integer'; min: number; max: number; takesEffect: TakesEffect }
  | { kind: 'enum'; values: readonly string[]; takesEffect: TakesEffect }
  | { kind: 'boolean'; takesEffect: TakesEffect }
  | { kind: 'payoutTime'; takesEffect: TakesEffect };

/** 3.2 allowed ranges and R11.1 effect timing, per parameter. */
export const PARAMETER_SPECS: Readonly<Record<ParameterName, ParameterSpec>> = {
  contributionAmount: { kind: 'integer', min: 500, max: 1_000_000, takesEffect: 'NEXT_ROUND' },
  solidarityContribution: { kind: 'integer', min: 0, max: 50_000, takesEffect: 'NEXT_ROUND' },
  frequency: { kind: 'enum', values: ['WEEKLY', 'BIWEEKLY', 'MONTHLY'], takesEffect: 'NEXT_CYCLE' },
  // R2.2 derives every round date of a cycle from its first payout time, so the payout time, like
  // the frequency, changes from the next cycle.
  payoutTime: { kind: 'payoutTime', takesEffect: 'NEXT_CYCLE' },
  lateFine: { kind: 'integer', min: 0, max: 50_000, takesEffect: 'NEXT_ROUND' },
  rotationMode: { kind: 'enum', values: ['FIXED', 'BIDDING'], takesEffect: 'NEXT_CYCLE' },
  minBid: { kind: 'integer', min: 0, max: 1_000_000, takesEffect: 'NEXT_ROUND' },
  loanRatePermille: { kind: 'integer', min: 0, max: 100, takesEffect: 'NEXT_ROUND' },
  loanMaxMonths: { kind: 'integer', min: 1, max: 6, takesEffect: 'NEXT_ROUND' },
  loanLimitFactorPermille: { kind: 'integer', min: 0, max: 3_000, takesEffect: 'NEXT_ROUND' },
  numberChangeHoldHours: { kind: 'integer', min: 0, max: 168, takesEffect: 'NEXT_ROUND' },
  voteWindowHours: { kind: 'integer', min: 24, max: 168, takesEffect: 'NEXT_ROUND' },
  solidarityVoteWindowHours: { kind: 'integer', min: 12, max: 72, takesEffect: 'NEXT_ROUND' },
  meetingAbsenceFine: { kind: 'integer', min: 0, max: 50_000, takesEffect: 'NEXT_ROUND' },
  distributeFundAtCycleEnd: { kind: 'boolean', takesEffect: 'NEXT_ROUND' },
  reliabilityWindow: { kind: 'integer', min: 6, max: 24, takesEffect: 'NEXT_ROUND' },
};

const PARAMETER_ORDER = Object.keys(PARAMETER_SPECS).sort() as ParameterName[];

/** 3.2 defaults. The payout time is the spec's example (last Saturday of the month, 18:00). */
export const DEFAULT_RULE_SET: Readonly<RuleSetParams> = Object.freeze<RuleSetParams>({
  contributionAmount: 10_000,
  solidarityContribution: 1_000,
  frequency: 'MONTHLY',
  payoutTime: { hour: 18, minute: 0, monthlyAnchor: { kind: 'LAST_WEEKDAY', weekday: 6 } },
  lateFine: 1_000,
  rotationMode: 'FIXED',
  minBid: 500,
  loanRatePermille: 50,
  loanMaxMonths: 3,
  loanLimitFactorPermille: 1_000,
  numberChangeHoldHours: 48,
  voteWindowHours: 72,
  solidarityVoteWindowHours: 24,
  meetingAbsenceFine: 0,
  distributeFundAtCycleEnd: true,
  reliabilityWindow: 12,
});

export type ParameterRefusal =
  | Refusal<'UNKNOWN_PARAMETER', { parameter: string }>
  | Refusal<'INVALID_VALUE', { parameter: ParameterName }>
  | Refusal<'VALUE_OUT_OF_RANGE', { parameter: ParameterName; min: number; max: number }>;

const isInt = (v: unknown, min: number, max: number): boolean =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;

function validAnchor(a: unknown): a is MonthlyAnchor {
  if (!a || typeof a !== 'object') return false;
  const anchor = a as Record<string, unknown>;
  switch (anchor.kind) {
    case 'DAY_OF_MONTH':
      return isInt(anchor.day, 1, 31);
    case 'LAST_WEEKDAY':
      return isInt(anchor.weekday, 0, 6);
    case 'NTH_WEEKDAY':
      return isInt(anchor.nth, 1, 4) && isInt(anchor.weekday, 0, 6);
    default:
      return false;
  }
}

function validPayoutTime(v: unknown): v is PayoutTime {
  if (!v || typeof v !== 'object') return false;
  const t = v as Record<string, unknown>;
  return isInt(t.hour, 0, 23) && isInt(t.minute, 0, 59) && validAnchor(t.monthlyAnchor);
}

/** 3.2, R11.7: checks one parameter value against its type and allowed range. */
export function validateParameter(
  parameter: string,
  value: unknown,
): { ok: true } | ParameterRefusal {
  if (!Object.prototype.hasOwnProperty.call(PARAMETER_SPECS, parameter)) {
    return { ok: false, code: 'UNKNOWN_PARAMETER', parameter };
  }
  const name = parameter as ParameterName;
  const spec = PARAMETER_SPECS[name];
  switch (spec.kind) {
    case 'integer':
      if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
        return { ok: false, code: 'INVALID_VALUE', parameter: name };
      }
      if (value < spec.min || value > spec.max) {
        return {
          ok: false,
          code: 'VALUE_OUT_OF_RANGE',
          parameter: name,
          min: spec.min,
          max: spec.max,
        };
      }
      return { ok: true };
    case 'enum':
      return typeof value === 'string' && spec.values.includes(value)
        ? { ok: true }
        : { ok: false, code: 'INVALID_VALUE', parameter: name };
    case 'boolean':
      return typeof value === 'boolean'
        ? { ok: true }
        : { ok: false, code: 'INVALID_VALUE', parameter: name };
    case 'payoutTime':
      return validPayoutTime(value)
        ? { ok: true }
        : { ok: false, code: 'INVALID_VALUE', parameter: name };
  }
}

/** 3.2: checks a whole rule set (used at group creation and before saving a new version). */
export function validateRuleSet(params: RuleSetParams): { ok: true } | ParameterRefusal {
  for (const name of PARAMETER_ORDER) {
    const result = validateParameter(name, params[name]);
    if (!result.ok) return result;
  }
  for (const key of Object.keys(params)) {
    if (!Object.prototype.hasOwnProperty.call(PARAMETER_SPECS, key)) {
      return { ok: false, code: 'UNKNOWN_PARAMETER', parameter: key };
    }
  }
  return { ok: true };
}
