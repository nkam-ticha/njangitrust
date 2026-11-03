import { describe, expect, it } from 'vitest';
import { DEFAULT_RULE_SET, PARAMETER_SPECS, validateRuleSet, type ParameterName } from './params';

describe('parameters and defaults (3.2)', () => {
  it('has the spec defaults', () => {
    expect(DEFAULT_RULE_SET).toMatchObject({
      contributionAmount: 10_000,
      solidarityContribution: 1_000,
      frequency: 'MONTHLY',
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
    // The spec's example payout time: last Saturday of the month, 18:00.
    expect(DEFAULT_RULE_SET.payoutTime).toEqual({
      hour: 18,
      minute: 0,
      monthlyAnchor: { kind: 'LAST_WEEKDAY', weekday: 6 },
    });
    expect(validateRuleSet(DEFAULT_RULE_SET)).toEqual({ ok: true });
  });

  const ranges: [ParameterName, number, number][] = [
    ['contributionAmount', 500, 1_000_000],
    ['solidarityContribution', 0, 50_000],
    ['lateFine', 0, 50_000],
    ['minBid', 0, 1_000_000],
    ['loanRatePermille', 0, 100],
    ['loanMaxMonths', 1, 6],
    ['loanLimitFactorPermille', 0, 3_000],
    ['numberChangeHoldHours', 0, 168],
    ['voteWindowHours', 24, 168],
    ['solidarityVoteWindowHours', 12, 72],
    ['meetingAbsenceFine', 0, 50_000],
    ['reliabilityWindow', 6, 24],
  ];

  it.each(ranges)('%s accepts %i to %i and refuses values outside (R11.7)', (name, min, max) => {
    expect(PARAMETER_SPECS[name]).toMatchObject({ kind: 'integer', min, max });
    for (const ok of [min, max]) {
      expect(validateRuleSet({ ...DEFAULT_RULE_SET, [name]: ok })).toEqual({ ok: true });
    }
    for (const bad of [min - 1, max + 1]) {
      expect(validateRuleSet({ ...DEFAULT_RULE_SET, [name]: bad })).toEqual({
        ok: false,
        code: 'VALUE_OUT_OF_RANGE',
        parameter: name,
        min,
        max,
      });
    }
    expect(validateRuleSet({ ...DEFAULT_RULE_SET, [name]: min + 0.5 })).toEqual({
      ok: false,
      code: 'INVALID_VALUE',
      parameter: name,
    });
  });

  it('checks enums, booleans and the payout time', () => {
    expect(validateRuleSet({ ...DEFAULT_RULE_SET, frequency: 'DAILY' as never })).toMatchObject({
      code: 'INVALID_VALUE',
      parameter: 'frequency',
    });
    expect(validateRuleSet({ ...DEFAULT_RULE_SET, rotationMode: 'BIDDING' })).toEqual({ ok: true });
    expect(
      validateRuleSet({ ...DEFAULT_RULE_SET, distributeFundAtCycleEnd: 'yes' as never }),
    ).toMatchObject({ code: 'INVALID_VALUE' });
    for (const payoutTime of [
      { hour: 24, minute: 0, monthlyAnchor: { kind: 'DAY_OF_MONTH', day: 1 } },
      { hour: 18, minute: 60, monthlyAnchor: { kind: 'DAY_OF_MONTH', day: 1 } },
      { hour: 18, minute: 0, monthlyAnchor: { kind: 'DAY_OF_MONTH', day: 32 } },
      { hour: 18, minute: 0, monthlyAnchor: { kind: 'NTH_WEEKDAY', nth: 5, weekday: 6 } },
      { hour: 18, minute: 0, monthlyAnchor: { kind: 'LAST_WEEKDAY', weekday: 7 } },
    ]) {
      expect(
        validateRuleSet({ ...DEFAULT_RULE_SET, payoutTime: payoutTime as never }),
      ).toMatchObject({
        code: 'INVALID_VALUE',
        parameter: 'payoutTime',
      });
    }
  });
});
