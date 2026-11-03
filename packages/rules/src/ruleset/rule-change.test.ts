import { describe, expect, it } from 'vitest';
import { DEFAULT_RULE_SET } from './params';
import { applyRuleChange, ruleChangeTakesEffect, validateRuleChange } from './rule-change';

describe('rule change proposals (R11.1, R11.6, R11.7)', () => {
  it('accepts a valid change and says when each parameter takes effect', () => {
    expect(
      validateRuleChange({
        current: DEFAULT_RULE_SET,
        changes: { lateFine: 1_500, frequency: 'WEEKLY' },
        openRuleChangeParameters: [],
      }),
    ).toEqual({
      ok: true,
      effects: [
        { parameter: 'frequency', from: 'MONTHLY', to: 'WEEKLY', takesEffect: 'NEXT_CYCLE' },
        { parameter: 'lateFine', from: 1_000, to: 1_500, takesEffect: 'NEXT_ROUND' },
      ],
    });
  });

  it('rotation mode, frequency and payout time change from the next cycle; the rest next round', () => {
    expect(ruleChangeTakesEffect('rotationMode')).toBe('NEXT_CYCLE');
    expect(ruleChangeTakesEffect('frequency')).toBe('NEXT_CYCLE');
    expect(ruleChangeTakesEffect('payoutTime')).toBe('NEXT_CYCLE');
    expect(ruleChangeTakesEffect('contributionAmount')).toBe('NEXT_ROUND');
    expect(ruleChangeTakesEffect('lateFine')).toBe('NEXT_ROUND');
  });

  it('refuses values out of range (R11.7)', () => {
    expect(
      validateRuleChange({
        current: DEFAULT_RULE_SET,
        changes: { lateFine: 60_000 },
        openRuleChangeParameters: [],
      }),
    ).toEqual({
      ok: false,
      code: 'VALUE_OUT_OF_RANGE',
      parameter: 'lateFine',
      min: 0,
      max: 50_000,
    });
  });

  it('refuses a second open proposal for the same parameter (R11.6)', () => {
    expect(
      validateRuleChange({
        current: DEFAULT_RULE_SET,
        changes: { lateFine: 1_500 },
        openRuleChangeParameters: ['lateFine'],
      }),
    ).toEqual({ ok: false, code: 'RULE_CHANGE_ALREADY_OPEN', parameter: 'lateFine' });
  });

  it('refuses empty changes, unknown parameters and no-op changes', () => {
    const base = { current: DEFAULT_RULE_SET, openRuleChangeParameters: [] };
    expect(validateRuleChange({ ...base, changes: {} })).toEqual({
      ok: false,
      code: 'EMPTY_RULE_CHANGE',
    });
    expect(validateRuleChange({ ...base, changes: { dueAtHours: 12 } as never })).toEqual({
      ok: false,
      code: 'UNKNOWN_PARAMETER',
      parameter: 'dueAtHours',
    });
    expect(validateRuleChange({ ...base, changes: { lateFine: 1_000 } })).toEqual({
      ok: false,
      code: 'NO_CHANGE',
      parameter: 'lateFine',
    });
  });

  it('applies a change without mutating the current rule set', () => {
    const next = applyRuleChange(DEFAULT_RULE_SET, { lateFine: 1_500 });
    expect(next.lateFine).toBe(1_500);
    expect(DEFAULT_RULE_SET.lateFine).toBe(1_000);
    expect(() => applyRuleChange(DEFAULT_RULE_SET, { lateFine: -1 })).toThrow(RangeError);
  });
});
