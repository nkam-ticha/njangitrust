import { describe, expect, it } from 'vitest';
import { MOCK_FEE_SCHEDULE } from '../fees';
import { dailyReconciliation, inFlightFeeTolerance } from './daily-check';
import { paymentReceivedPostings } from './fee-postings';
import { chainOf, completeOf, entry, seedFund, sendOf, TEST_GROUP } from './ledger.test-support';

const OTHER_GROUP = 'a1b2c3d4-0000-4000-8000-000000000002';

const credit = (m: string, amount: number) =>
  entry(
    'PAYMENT_RECEIVED',
    paymentReceivedPostings({
      payerMembershipId: 'SEED',
      fee: 0,
      feeSource: 'PROVIDER',
      parts: [{ kind: 'CONTRIBUTION', amount, creditorMembershipId: m }],
    }),
    { membershipId: 'SEED' },
  );

/** Cash 30 000; M7 has a 5 000 withdrawal (estimated fee 500) in flight; a 2 000 one completed. */
function groupWithPayoutInFlight() {
  const done = sendOf('WITHDRAWAL', 'M7', 2_000, { feeEstimated: 500 });
  return chainOf([
    ...seedFund(20_000),
    credit('M7', 10_000),
    done,
    completeOf(done),
    sendOf('WITHDRAWAL', 'M7', 5_000, { feeEstimated: 500 }),
  ]);
}

describe('the daily check over every group of a provider account (spec 2.9, 2.5 invariant 6)', () => {
  it('takes the fee tolerance from the estimated fees of the payouts still in flight (owner Q5)', () => {
    expect(inFlightFeeTolerance(groupWithPayoutInFlight())).toBe(500);
    expect(inFlightFeeTolerance(chainOf(seedFund(1_000)))).toBe(0);
  });

  it('adds up cash and money in flight across groups, and is a WARNING within the tolerance', () => {
    const a = groupWithPayoutInFlight(); // cash 27 500 after the completed 2 000 + 500
    const b = chainOf([credit('M1', 4_000)], OTHER_GROUP);
    const groups = [
      { groupId: TEST_GROUP, transactions: a },
      { groupId: OTHER_GROUP, transactions: b },
    ];
    // The provider already paid the 5 000 with a fee of 600, and an 11 000 collection arrived.
    const result = dailyReconciliation({
      groups,
      providerBalance: 27_500 + 4_000 - 5_600 + 10_900,
      pendingCollections: [11_000],
      feeSchedule: MOCK_FEE_SCHEDULE,
    });
    expect(result).toMatchObject({
      status: 'WARNING',
      withdrawalsPaused: false,
      ledgerCash: 31_500,
      inFlightDisbursements: 5_500,
      inFlightCollections: 10_900,
      inFlightFeeTolerance: 500,
      reservedShortfall: 0,
      difference: 5_300,
    });
    expect(result.groups.map((g) => [g.groupId, g.problems, g.reservedShortfall])).toEqual([
      [TEST_GROUP, [], 0],
      [OTHER_GROUP, [], 0],
    ]);
    expect(
      dailyReconciliation({
        groups,
        providerBalance: 31_500,
        pendingCollections: [],
        feeSchedule: MOCK_FEE_SCHEDULE,
      }).status,
    ).toBe('OK');
    expect(
      dailyReconciliation({
        groups,
        providerBalance: 31_500 - 6_001,
        pendingCollections: [],
        feeSchedule: MOCK_FEE_SCHEDULE,
      }).status,
    ).toBe('ALERT');
  });

  it('is an ALERT naming the group and seq when a ledger is broken', () => {
    const a = groupWithPayoutInFlight();
    const tampered = a.map((t) => (t.seq === 3 ? { ...t, descriptionEn: 'changed' } : t));
    const result = dailyReconciliation({
      groups: [{ groupId: TEST_GROUP, transactions: tampered }],
      providerBalance: 27_500,
      pendingCollections: [],
      feeSchedule: MOCK_FEE_SCHEDULE,
    });
    expect(result.status).toBe('ALERT');
    expect(result.groups[0]!.problems).toEqual([
      expect.objectContaining({ seq: 3, code: 'HASH_MISMATCH' }),
    ]);
  });
});
