import { describe, expect, it } from 'vitest';
import { DEFAULT_RULE_SET } from './params';
import {
  applyRuleChange,
  ruleChangeTakesEffect,
  ruleChangeTargetRound,
  validateRuleChange,
} from './rule-change';

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
        { parameter: 'frequency', from: 'MONTHLY', to: 'WEEKLY', takesEffect: 'NEXT_ROUND' },
        { parameter: 'lateFine', from: 1_000, to: 1_500, takesEffect: 'NEXT_ROUND' },
      ],
    });
  });

  it('applies every rule change from the next round, rotation mode, frequency and payout time included (D13.1)', () => {
    expect(ruleChangeTakesEffect('rotationMode')).toBe('NEXT_ROUND');
    expect(ruleChangeTakesEffect('frequency')).toBe('NEXT_ROUND');
    expect(ruleChangeTakesEffect('payoutTime')).toBe('NEXT_ROUND');
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

describe('the round a passed rule change applies from (D13.1, M5)', () => {
  const round = (number: number, opened: boolean, hasCredits = false) => ({
    number,
    opened,
    hasCredits,
  });

  it('is the first round not yet opened', () => {
    expect(
      ruleChangeTargetRound([round(1, true), round(2, true), round(3, false), round(4, false)]),
    ).toEqual({
      ok: true,
      nextCycle: false,
      roundNumber: 3,
    });
  });

  it('refuses a round that already holds money (it would mix two rule sets)', () => {
    expect(ruleChangeTargetRound([round(1, true), round(2, false, true)])).toEqual({
      ok: false,
      code: 'ROUND_ALREADY_HAS_CREDITS',
      roundNumber: 2,
    });
  });

  it('says when every round of the cycle is open: the change starts with the next cycle', () => {
    expect(ruleChangeTargetRound([round(1, true), round(2, true)])).toEqual({
      ok: true,
      nextCycle: true,
      roundNumber: 1,
    });
  });
});
