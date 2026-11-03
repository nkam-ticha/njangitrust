import { describe, expect, it } from 'vitest';
import { MOCK_FEE_SCHEDULE } from '../fees';
import { validateSolidarityRequest } from './solidarity';

const base = {
  event: 'NAISSANCE' as const,
  solidarityFundBalance: 30_000,
  pendingSolidarityPayouts: 0,
  feeSchedule: MOCK_FEE_SCHEDULE,
  recipientIsMember: true,
};

describe('solidarity requests (R10.2, R10.3)', () => {
  it('accepts an amount up to the fund balance; the recipient bears the fee', () => {
    expect(validateSolidarityRequest({ ...base, amount: 20_000 })).toEqual({
      ok: true,
      amount: 20_000,
      feeEstimate: 500,
      recipientReceives: 19_500,
    });
    expect(validateSolidarityRequest({ ...base, amount: 30_000 })).toMatchObject({ ok: true });
  });

  it('refuses more than the fund holds, counting payouts already voted and in progress', () => {
    expect(validateSolidarityRequest({ ...base, amount: 30_001 })).toEqual({
      ok: false,
      code: 'ABOVE_SOLIDARITY_FUND',
      balance: 30_000,
    });
    expect(
      validateSolidarityRequest({ ...base, amount: 20_000, pendingSolidarityPayouts: 15_000 }),
    ).toEqual({
      ok: false,
      code: 'ABOVE_SOLIDARITY_FUND',
      balance: 15_000,
    });
  });

  it('refuses unknown events, non-members, bad amounts and amounts that leave the recipient under 100 FCFA', () => {
    expect(validateSolidarityRequest({ ...base, event: 'VOYAGE' as never, amount: 5_000 })).toEqual(
      {
        ok: false,
        code: 'UNKNOWN_EVENT',
      },
    );
    expect(validateSolidarityRequest({ ...base, recipientIsMember: false, amount: 5_000 })).toEqual(
      {
        ok: false,
        code: 'RECIPIENT_NOT_MEMBER',
      },
    );
    expect(validateSolidarityRequest({ ...base, amount: 0 })).toEqual({
      ok: false,
      code: 'INVALID_AMOUNT',
    });
    expect(validateSolidarityRequest({ ...base, amount: 599 })).toEqual({
      ok: false,
      code: 'BELOW_MINIMUM_PAYOUT',
      minimumReceived: 100,
      feeEstimate: 500,
    });
  });
});
