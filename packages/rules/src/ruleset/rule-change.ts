// Rule change proposals (R11.1, R11.6, R11.7, R11.8).

import type { Refusal } from '../result';
import {
  PARAMETER_SPECS,
  validateParameter,
  validateRuleSet,
  type ParameterName,
  type ParameterRefusal,
  type RuleSetParams,
  type TakesEffect,
} from './params';

/** D13.1, R11.1, GOV-04: every passed RULE_CHANGE applies from the next round. */
export function ruleChangeTakesEffect(parameter: ParameterName): TakesEffect {
  return PARAMETER_SPECS[parameter].takesEffect;
}

export interface RuleChangeEffect {
  parameter: ParameterName;
  from: RuleSetParams[ParameterName];
  to: RuleSetParams[ParameterName];
  takesEffect: TakesEffect;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
    return ka.every((k) =>
      sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    );
  }
  return a === b;
}

/**
 * R11.6, R11.7, R11.1: validates a proposed RULE_CHANGE. Refuses unknown parameters, values outside
 * the allowed ranges, values equal to the current ones, and parameters that already have an open
 * RULE_CHANGE. On success lists each change with when it takes effect.
 */
export function validateRuleChange(input: {
  current: RuleSetParams;
  changes: Partial<RuleSetParams>;
  openRuleChangeParameters: readonly ParameterName[];
}):
  | { ok: true; effects: RuleChangeEffect[] }
  | ParameterRefusal
  | Refusal<'EMPTY_RULE_CHANGE'>
  | Refusal<'NO_CHANGE', { parameter: ParameterName }>
  | Refusal<'RULE_CHANGE_ALREADY_OPEN', { parameter: ParameterName }> {
  const keys = Object.keys(input.changes).sort();
  if (keys.length === 0) return { ok: false, code: 'EMPTY_RULE_CHANGE' };
  const effects: RuleChangeEffect[] = [];
  for (const key of keys) {
    const value = (input.changes as Record<string, unknown>)[key];
    const check = validateParameter(key, value);
    if (!check.ok) return check;
    const name = key as ParameterName;
    if (sameValue(input.current[name], value))
      return { ok: false, code: 'NO_CHANGE', parameter: name };
    if (input.openRuleChangeParameters.includes(name)) {
      return { ok: false, code: 'RULE_CHANGE_ALREADY_OPEN', parameter: name };
    }
    effects.push({
      parameter: name,
      from: input.current[name],
      to: value as RuleSetParams[ParameterName],
      takesEffect: ruleChangeTakesEffect(name),
    });
  }
  return { ok: true, effects };
}

/** R11.8: the rule set after applying a passed change. Throws if the result is invalid. */
export function applyRuleChange(
  current: RuleSetParams,
  changes: Partial<RuleSetParams>,
): RuleSetParams {
  const next: RuleSetParams = { ...current, ...changes };
  const check = validateRuleSet(next);
  if (!check.ok) throw new RangeError(`invalid rule set: ${check.code}`);
  return next;
}

/**
 * D13.1, GOV-04, L5: the round a passed rule change applies from, the first round not yet opened.
 * A round that already received money is refused (its obligations followed the old rules); when
 * every round of the cycle is open, the change starts with the next cycle's first round
 * (`nextCycle: true`, round 1 of that cycle).
 */
export function ruleChangeTargetRound(
  rounds: readonly { number: number; opened: boolean; hasCredits: boolean }[],
):
  | { ok: true; nextCycle: false; roundNumber: number }
  | { ok: true; nextCycle: true; roundNumber: 1 }
  | Refusal<'ROUND_ALREADY_HAS_CREDITS', { roundNumber: number }> {
  const next = [...rounds].sort((a, b) => a.number - b.number).find((r) => !r.opened);
  if (!next) return { ok: true, nextCycle: true, roundNumber: 1 };
  if (next.hasCredits)
    return { ok: false, code: 'ROUND_ALREADY_HAS_CREDITS', roundNumber: next.number };
  return { ok: true, nextCycle: false, roundNumber: next.number };
}
