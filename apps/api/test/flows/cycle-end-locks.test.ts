// Second audit pass on the end-of-cycle work (#76): one lock order (rounds, then the group) shared
// with the fine and bid code, a returning member who goes after everyone who joined since, weekly
// installments that never share a round, and the round scan.
import { verifyLedgerExport, type LedgerExport } from '@njangi/rules';
import { afterEach, describe, expect, it } from 'vitest';
import { clock, resetTestClock } from '../../src/lib/clock';
import { getPrisma } from '../../src/lib/prisma';
import {
  applyRotationChange,
  closeCycle,
  openDueRounds,
  openRound,
} from '../../src/modules/cycles';
import { openPayout } from '../../src/modules/payouts';
import { api, type TestUser } from '../helpers/client';
import { goTo, playCycle, relogin } from '../helpers/cycle-flows';
import { addMember, confirm, createGroup, inviteToken, signUp } from '../helpers/factories';
import { expectSoundLedger } from '../helpers/money-flows';

type Member = TestUser & { membershipId: string };

afterEach(() => resetTestClock());

async function startedGroup(others: number, overrides: Record<string, unknown> = {}) {
  const signedUp = await signUp();
  const created = await createGroup(signedUp, overrides);
  const groupId = created.groupId;
  await getPrisma().group.update({
    where: { id: groupId },
    data: { providerAccount: `test-${groupId}` },
  });
  const admin: Member = { ...signedUp, membershipId: created.adminMembershipId };
  const members: Member[] = [];
  for (let i = 0; i < others; i += 1) members.push(await addMember(admin, groupId));
  const card = await api(admin).post(`/v1/groups/${groupId}/cycles/start`);
  expect((await confirm(admin, card.body.action.id)).status).toBe(200);
  return { groupId, admin, everyone: [admin, ...members] };
}

/**
 * What a fine assessment or a bid close does: it locks the ROUND, then (through the ledger) the
 * group. `hold` runs while the round is locked and before the group is asked for.
 */
async function roundThenGroup(
  groupId: string,
  roundId: string,
  hold: () => Promise<void>,
): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Round" WHERE "id" = ${roundId}::uuid FOR UPDATE`;
    await hold();
    await tx.$queryRaw`SELECT "id" FROM "Group" WHERE "id" = ${groupId}::uuid FOR UPDATE`;
  });
}

describe('A: one lock order, rounds first then the group', () => {
  it('openRound and a fine on the previous round do not deadlock', async () => {
    const { groupId } = await startedGroup(3);
    const cycle = await getPrisma().cycle.findFirstOrThrow({ where: { groupId } });
    const rounds = await getPrisma().round.findMany({
      where: { cycleId: cycle.id },
      orderBy: { number: 'asc' },
    });
    goTo(new Date(rounds[0]!.payoutAt.getTime() + 60_000));
    expect(await openPayout(rounds[0]!.id)).toBe(true);

    let opening: Promise<boolean> | undefined;
    const fine = roundThenGroup(groupId, rounds[0]!.id, async () => {
      // The fine holds round 1; the next round opens meanwhile and must wait for it, not take the
      // group first (which would make each wait for the other).
      opening = openRound(rounds[1]!.id);
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    });
    await fine;
    expect(await opening).toBe(true);
  }, 30_000);

  it('closeCycle and a fine on a round do not deadlock', async () => {
    const { groupId, everyone } = await startedGroup(3);
    await playCycle(groupId, everyone);
    const cycle = await getPrisma().cycle.findFirstOrThrow({ where: { groupId } });
    const last = await getPrisma().round.findFirstOrThrow({
      where: { cycleId: cycle.id, number: 4 },
    });
    let closing: Promise<boolean> | undefined;
    const fine = roundThenGroup(groupId, last.id, async () => {
      closing = closeCycle(cycle.id);
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    });
    await fine;
    expect(await closing).toBe(true);
  }, 60_000);

  it('a rotation change (group first, then rounds) and a fine do not deadlock either', async () => {
    const { groupId } = await startedGroup(3);
    const cycle = await getPrisma().cycle.findFirstOrThrow({ where: { groupId } });
    const round2 = await getPrisma().round.findFirstOrThrow({
      where: { cycleId: cycle.id, number: 2 },
    });
    const swapped = [...cycle.rotation];
    [swapped[2], swapped[3]] = [swapped[3]!, swapped[2]!];
    let change: Promise<void> | undefined;
    const fine = roundThenGroup(groupId, round2.id, async () => {
      change = getPrisma().$transaction((tx) =>
        applyRotationChange(tx, { groupId, newOrder: swapped, proposalId: 'p-test' }),
      );
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    });
    await fine;
    await change;
    expect(
      (await getPrisma().cycle.findUniqueOrThrow({ where: { id: cycle.id } })).rotation,
    ).toEqual(swapped);
  }, 30_000);
});

describe('B: a returning member is a newcomer, ordered by when they joined this time', () => {
  it('A and M leave, B joins, A comes back: the order is admin, B, A', async () => {
    const { groupId, admin: adminM, everyone } = await startedGroup(2);
    const [a, m] = [everyone[1]!, everyone[2]!];
    for (const leaver of [a, m]) {
      const card = await api(leaver).post(`/v1/groups/${groupId}/leave`);
      expect((await confirm(leaver, card.body.action.id)).status).toBe(200);
    }
    const cycle1 = await getPrisma().cycle.findFirstOrThrow({ where: { groupId } });
    await playCycle(groupId, everyone);
    expect(await closeCycle(cycle1.id)).toBe(true);

    // B joins first (a new person), then A comes back: A joined LATER this time, so goes after B,
    // although A's membership row is older.
    const admin = await relogin(adminM);
    const b = await addMember(admin, groupId);
    goTo(new Date(clock.now().getTime() + 120_000));
    const token = await inviteToken(admin, groupId, { name: a.name, phone: a.phone });
    const accepted = await api(await relogin(a)).post(`/v1/auth/invites/${token}/accept`, {
      mode: 'existing',
    });
    expect(accepted.status).toBeLessThan(300);

    const preview = await api(admin).get(`/v1/groups/${groupId}/cycles/next`);
    const order = preview.body.order.map((o: { membershipId: string }) => o.membershipId);
    expect(order).toEqual([admin.membershipId, b.membershipId, a.membershipId]);

    const card = await api(admin).post(`/v1/groups/${groupId}/cycles/start`);
    expect((await confirm(admin, card.body.action.id)).status).toBe(200);
    const cycle2 = await getPrisma().cycle.findFirstOrThrow({ where: { groupId, number: 2 } });
    expect(cycle2.rotation).toEqual(order);
    const exported = await api(admin).get(`/v1/groups/${groupId}/ledger/export?format=json`);
    expect(verifyLedgerExport(exported.body as LedgerExport).problems).toEqual([]);
    await expectSoundLedger(groupId);
  }, 90_000);
});

describe('C: weekly installments never share a round', () => {
  it('after a late start each waiting installment gets its own round', async () => {
    const { groupId, everyone } = await startedGroup(3, { rules: { frequency: 'WEEKLY' } });
    const borrower = everyone[1]!;
    await playCycle(groupId, everyone);
    const cycle = await getPrisma().cycle.findFirstOrThrow({ where: { groupId } });
    expect(await closeCycle(cycle.id)).toBe(true);
    const day = 86_400_000;
    const loan = await getPrisma().loan.create({
      data: {
        groupId,
        membershipId: borrower.membershipId,
        principal: 30_000,
        months: 3,
        ratePermille: 50,
        interest: 4_500,
        feeEstimated: 500,
        totalDue: 35_000,
        status: 'DISBURSED',
        // Approved long ago: every "approval plus k months" date is before the new cycle.
        decidedAt: new Date(clock.now().getTime() - 150 * day),
      },
    });
    await getPrisma().obligation.createMany({
      data: [0, 1, 2].map((i) => ({
        groupId,
        membershipId: borrower.membershipId,
        kind: 'LOAN_INSTALLMENT' as const,
        loanId: loan.id,
        roundId: null,
        amount: 11_666,
        dueAt: new Date(clock.now().getTime() + (100 + 30 * i) * day),
      })),
    });
    const admin = await relogin(everyone[0]!);
    const card = await api(admin).post(`/v1/groups/${groupId}/cycles/start`);
    expect((await confirm(admin, card.body.action.id)).status).toBe(200);
    const cycle2 = await getPrisma().cycle.findFirstOrThrow({ where: { groupId, number: 2 } });
    const rounds = await getPrisma().round.findMany({
      where: { cycleId: cycle2.id },
      orderBy: { number: 'asc' },
    });
    const installments = await getPrisma().obligation.findMany({
      where: { loanId: loan.id },
      orderBy: { dueAt: 'asc' },
    });
    expect(installments.map((o) => o.roundId)).toEqual([
      rounds[0]!.id,
      rounds[1]!.id,
      rounds[2]!.id,
    ]);
  }, 90_000);
});

describe('round scan and reads', () => {
  it('opens a round whose previous round has already been closed', async () => {
    const { groupId } = await startedGroup(3);
    const cycle = await getPrisma().cycle.findFirstOrThrow({ where: { groupId } });
    const rounds = await getPrisma().round.findMany({
      where: { cycleId: cycle.id },
      orderBy: { number: 'asc' },
    });
    goTo(new Date(rounds[0]!.payoutAt.getTime() + 60_000));
    await getPrisma().round.update({ where: { id: rounds[0]!.id }, data: { status: 'CLOSED' } });
    expect(await openRound(rounds[1]!.id)).toBe(true);
  }, 30_000);

  it('the scan opens a ready round and leaves one whose previous round is still open', async () => {
    const { groupId } = await startedGroup(3);
    const cycle = await getPrisma().cycle.findFirstOrThrow({ where: { groupId } });
    const rounds = await getPrisma().round.findMany({
      where: { cycleId: cycle.id },
      orderBy: { number: 'asc' },
    });
    goTo(new Date(rounds[0]!.payoutAt.getTime() + 60_000));
    // Round 1 has not paid out: the scan must not open round 2 (nor be held up by it).
    await openDueRounds();
    expect(
      (await getPrisma().round.findUniqueOrThrow({ where: { id: rounds[1]!.id } })).status,
    ).toBe('SCHEDULED');
    expect(await openPayout(rounds[0]!.id)).toBe(true);
    await openDueRounds();
    expect(
      (await getPrisma().round.findUniqueOrThrow({ where: { id: rounds[1]!.id } })).status,
    ).toBe('OPEN');
  }, 30_000);

  it('shows a member who joined after the cycle as outside it, even when nothing was shared', async () => {
    const { groupId, everyone } = await startedGroup(3);
    await playCycle(groupId, everyone);
    const cycle = await getPrisma().cycle.findFirstOrThrow({ where: { groupId } });
    expect(await closeCycle(cycle.id)).toBe(true);
    const target = everyone[1]!;
    await getPrisma().membership.update({
      where: { id: target.membershipId },
      data: { activeFromCycle: 2 },
    });
    const summary = await api(await relogin(target)).get(`/v1/groups/${groupId}/cycles/1`);
    expect(summary.status).toBe(200);
    // Nothing was shared (the fund was empty), but the member was not in the cycle at all.
    expect(summary.body.fund.reason).not.toBeNull();
    expect(summary.body.mine.outcome).toBe('NOT_IN_CYCLE');
  }, 60_000);
});
