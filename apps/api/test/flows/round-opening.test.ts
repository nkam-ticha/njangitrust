// A round opens right after the previous round's payout (R3.1, R2.2): members then have until its
// deadline, a day (or half a period) before its own payout, to pay. It never waits for its deadline.
import { afterEach, describe, expect, it } from 'vitest';
import { advanceTestClock, resetTestClock } from '../../src/lib/clock';
import { getPrisma } from '../../src/lib/prisma';
import { openRound } from '../../src/modules/cycles';
import { openPayout } from '../../src/modules/payouts';
import { realGroup } from '../helpers/money-flows';

afterEach(() => resetTestClock());

describe('opening the next round', () => {
  it('opens only after the previous payout, with its obligations due at its own deadline', async () => {
    const { groupId, everyone, rounds } = await realGroup();
    const [first, second, third] = rounds as [
      (typeof rounds)[number],
      (typeof rounds)[number],
      (typeof rounds)[number],
    ];

    // Before the first payout nothing opens, and the second round has no obligations yet.
    expect(await openRound(second.id)).toBe(false);
    expect(await getPrisma().obligation.count({ where: { roundId: second.id } })).toBe(0);

    // Just after the first payout: the second round opens although its deadline is a month away.
    advanceTestClock(first.payoutAt.getTime() - Date.now() + 60_000);
    expect(second.dueAt.getTime()).toBeGreaterThan(Date.now());
    // M4: the previous round must have paid out (PAYOUT or CLOSED), not only reached its time.
    expect(await openRound(second.id)).toBe(false);
    expect(await openPayout(first.id)).toBe(true);
    expect(await openRound(second.id)).toBe(true);
    expect((await getPrisma().round.findUniqueOrThrow({ where: { id: first.id } })).status).toBe(
      'CLOSED',
    );
    const opened = await getPrisma().round.findUniqueOrThrow({ where: { id: second.id } });
    expect(opened.status).toBe('OPEN');
    const obligations = await getPrisma().obligation.findMany({ where: { roundId: second.id } });
    // Everyone owes the contribution and the solidarity part, due at the round's own deadline.
    expect(obligations.filter((o) => o.kind === 'CONTRIBUTION')).toHaveLength(everyone.length);
    expect(obligations.filter((o) => o.kind === 'SOLIDARITY')).toHaveLength(everyone.length);
    expect(obligations.every((o) => o.dueAt.getTime() === second.dueAt.getTime())).toBe(true);

    // Opening twice changes nothing, and the third round still waits for the second payout.
    expect(await openRound(second.id)).toBe(false);
    expect(await getPrisma().obligation.count({ where: { roundId: second.id } })).toBe(
      obligations.length,
    );
    expect(await openRound(third.id)).toBe(false);
    expect(groupId).toBeTruthy();
  });
});
