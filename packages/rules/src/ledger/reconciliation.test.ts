import { describe, expect, it } from 'vitest';
import { reconcile } from './reconciliation';

describe('daily reconciliation (2.5 invariant 6, R5.5, spec 5.2)', () => {
  const base = {
    ledgerCash: 250_000,
    inFlightCollections: 0,
    inFlightDisbursements: 0,
    ledgerProblemCount: 0,
  };

  it('is OK when the provider balance equals ledger cash across all groups', () => {
    expect(reconcile({ ...base, providerBalance: 250_000 })).toEqual({
      status: 'OK',
      difference: 0,
      withdrawalsPaused: false,
    });
  });

  it('is a WARNING when operations in flight explain the difference', () => {
    // A 20 000 withdrawal (fee 500) may already have left the provider account.
    expect(reconcile({ ...base, providerBalance: 229_500, inFlightDisbursements: 20_500 })).toEqual(
      { status: 'WARNING', difference: -20_500, withdrawalsPaused: false },
    );
    // An 11 000 payment may already have arrived, net of its 100 fee.
    expect(
      reconcile({ ...base, providerBalance: 260_900, inFlightCollections: 10_900 }),
    ).toMatchObject({
      status: 'WARNING',
    });
  });

  it('moves to ALERT on an injected difference, which pauses withdrawals', () => {
    expect(reconcile({ ...base, providerBalance: 249_000 })).toEqual({
      status: 'ALERT',
      difference: -1_000,
      withdrawalsPaused: true,
    });
    expect(reconcile({ ...base, providerBalance: 251_000 })).toMatchObject({ status: 'ALERT' });
    expect(
      reconcile({ ...base, providerBalance: 229_000, inFlightDisbursements: 20_500 }),
    ).toMatchObject({
      status: 'ALERT',
    });
  });

  it('moves to ALERT when the ledger itself breaks an invariant', () => {
    expect(reconcile({ ...base, providerBalance: 250_000, ledgerProblemCount: 1 })).toMatchObject({
      status: 'ALERT',
      withdrawalsPaused: true,
    });
  });
});
