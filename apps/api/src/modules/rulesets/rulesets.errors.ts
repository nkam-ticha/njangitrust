// Turns a rules-engine refusal about rule values into the member's message (3.2, R11.7).
import type { ParameterRefusal } from '@njangi/rules';
import { groupErrorTexts as t } from '@njangi/shared/i18n/server/groups';
import { ruleLabels, type RuleLabelKey } from '@njangi/shared/i18n/server/rulesets';
import { defineErrors, type AppError } from '../../lib/errors';

export const rulesetError = defineErrors({
  RULE_VALUE_OUT_OF_RANGE: { status: 400, text: t.RULE_VALUE_OUT_OF_RANGE },
  RULE_VALUE_INVALID: { status: 400, text: t.RULE_VALUE_INVALID },
  RULE_UNKNOWN: { status: 400, text: t.RULE_UNKNOWN },
  NOT_LAST_WEEKDAY_OF_MONTH: { status: 400, text: t.NOT_LAST_WEEKDAY_OF_MONTH },
  FIFTH_WEEKDAY_NOT_ALLOWED: { status: 400, text: t.FIFTH_WEEKDAY_NOT_ALLOWED },
  FIRST_PAYOUT_IN_PAST: { status: 400, text: t.FIRST_PAYOUT_IN_PAST },
});

function labelOf(parameter: string) {
  return Object.prototype.hasOwnProperty.call(ruleLabels, parameter)
    ? ruleLabels[parameter as RuleLabelKey]
    : { fr: parameter, en: parameter };
}

export function parameterRefusalToError(refusal: ParameterRefusal): AppError {
  const details = { parameter: refusal.parameter };
  switch (refusal.code) {
    case 'VALUE_OUT_OF_RANGE':
      return rulesetError('RULE_VALUE_OUT_OF_RANGE', {
        params: { rule: labelOf(refusal.parameter), min: refusal.min, max: refusal.max },
        details: { ...details, min: refusal.min, max: refusal.max },
      });
    case 'INVALID_VALUE':
      return rulesetError('RULE_VALUE_INVALID', { params: { rule: labelOf(refusal.parameter) }, details });
    case 'UNKNOWN_PARAMETER':
      return rulesetError('RULE_UNKNOWN', { params: { rule: labelOf(refusal.parameter) }, details });
  }
}
