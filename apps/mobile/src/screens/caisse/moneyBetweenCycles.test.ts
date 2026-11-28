import { describe, expect, it } from 'vitest';
import { showMoneyBetweenCycles } from './moneyBetweenCycles';

const money = {
  available: 0,
  locked: 0,
  unlocksAt: null,
  debtsDue: 0,
  hold: null,
  withdrawalsPaused: false,
  withdrawalInProgress: false,
};

describe('money block between two cycles (D40, R3.4, R5)', () => {
  it('shows nothing for a member with nothing available and nothing to pay', () => {
    expect(showMoneyBetweenCycles(money, 0)).toBe(false);
  });

  it('shows what can be withdrawn: the fund share and the last payout', () => {
    expect(showMoneyBetweenCycles({ ...money, available: 5_000 }, 0)).toBe(true);
  });

  it('shows debts that can still be paid (contributions and fines carried over)', () => {
    expect(showMoneyBetweenCycles(money, 2)).toBe(true);
    expect(showMoneyBetweenCycles({ ...money, debtsDue: 1_000 }, 0)).toBe(true);
  });

  it('shows money that is locked, held or on its way out, so the member sees why', () => {
    expect(showMoneyBetweenCycles({ ...money, locked: 4_000 }, 0)).toBe(true);
    expect(
      showMoneyBetweenCycles(
        { ...money, hold: { reason: 'NUMBER', until: '2026-12-01T00:00:00Z' } },
        0,
      ),
    ).toBe(true);
    expect(showMoneyBetweenCycles({ ...money, withdrawalInProgress: true }, 0)).toBe(true);
  });

  it('shows nothing while the figures are not loaded', () => {
    expect(showMoneyBetweenCycles(undefined, 0)).toBe(false);
  });
});
