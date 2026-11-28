// End of cycle (R9.3, R9.4, R12.2, D40, #76): closing a cycle shares the general fund, a member
// with an unpaid obligation keeps their debt and gets no share, a leaving member gets paid then
// leaves, and the admin starts the next cycle with the previous order kept.
import {
  availableForLoans,
  computeBalances,
  planCycleClose,
  summarizeBalances,
  type CycleCloseMember,
} from '@njangi/rules';
import { afterEach, describe, expect, it } from 'vitest';
import { resetTestClock } from '../../src/lib/clock';
import { getPrisma } from '../../src/lib/prisma';
import { closeCycle, closeDueCycles, remindAdminsBetweenCycles } from '../../src/modules/cycles';
import { settleBackground } from '../../src/jobs/dispatch';
import { api, type TestUser } from '../helpers/client';
import { addMember, confirm, createGroup, signUp } from '../helpers/factories';
import { payRound, playCycle, relogin, seedGeneralFund } from '../helpers/cycle-flows';
import { expectSoundLedger } from '../helpers/money-flows';

type Member = TestUser & { membershipId: string };

afterEach(() => resetTestClock());

/** Four members, the first cycle started, its own operator account. */
async function fourMemberGroup(): Promise<{ groupId: string; everyone: Member[]; admin: Member }> {
  const user = await signUp();
  const created = await createGroup(user);
  const groupId = created.groupId;
  await getPrisma().group.update({
    where: { id: groupId },
    data: { providerAccount: `test-${groupId}` },
  });
  const admin: Member = { ...user, membershipId: created.adminMembershipId };
  const members: Member[] = [];
  for (let i = 0; i < 3; i += 1) members.push(await addMember(admin, groupId));
  const card = await api(admin).post(`/v1/groups/${groupId}/cycles/start`);
  expect((await confirm(admin, card.body.action.id)).status).toBe(200);
  return { groupId, everyone: [admin, ...members], admin };
}

describe('closing a cycle shares the general fund (R9.3, D40.1)', () => {
  it('leaves a debtor out, matches the pure rules function, and is idempotent', async () => {
    const { groupId, everyone } = await fourMemberGroup();
    const cycleBefore = await getPrisma().cycle.findFirstOrThrow({ where: { groupId } });
    // Round 1's beneficiary is served before any fine exists; skipping their round 2 payment
    // means the fine can never be auto-settled by a later payout of their own in this cycle
    // (R5.3 only settles the ROUND'S beneficiary, and they are not served again).
    const debtorId = cycleBefore.rotation[0]!;
    const debtor = everyone.find((m) => m.membershipId === debtorId)!;
    // The general fund already holds 20 000 FCFA of real, collected money (a fine paid in full).
    const seedMembership = everyone[0]!.membershipId;
    await seedGeneralFund(groupId, seedMembership, 20_000);
    await playCycle(groupId, everyone, { unpaid: [{ member: debtor, round: 2 }] });

    const cycle = await getPrisma().cycle.findUniqueOrThrow({ where: { id: cycleBefore.id } });
    const rounds = await getPrisma().round.findMany({ where: { cycleId: cycle.id } });
    expect(rounds.every((r) => r.status === 'PAYOUT' || r.status === 'CLOSED')).toBe(true);

    // Not due before the last payout.
    expect(await closeCycle(cycle.id, new Date(0))).toBe(false);

    // The figures exactly as the real close transaction will read them, fed to the same pure
    // rules function: this is what `closeCycle` must produce, with no hand-computed fee totals.
    const chainBefore = await expectSoundLedger(groupId);
    const summaryBefore = summarizeBalances(computeBalances(chainBefore));
    const memberships = await getPrisma().membership.findMany({
      where: { groupId, status: { in: ['ACTIVE', 'LEAVING'] } },
    });
    const owed = await getPrisma().obligation.groupBy({
      by: ['membershipId'],
      where: { groupId, status: 'DUE' },
      _sum: { amount: true },
    });
    const unpaidByMember = new Map(owed.map((row) => [row.membershipId, row._sum.amount ?? 0]));
    const members: CycleCloseMember[] = memberships.map((m) => ({
      membershipId: m.id,
      status: m.status,
      activeFromCycle: m.activeFromCycle,
      unpaidObligations: unpaidByMember.get(m.id) ?? 0,
      receivable: Math.max(0, summaryBefore.receivableByMember[m.id] ?? 0),
    }));
    const available = availableForLoans({ summary: summaryBefore });
    const expected = planCycleClose({
      cycleNumber: cycle.number,
      distributeFundAtCycleEnd: true,
      generalFund: summaryBefore.generalFund,
      receivables: summaryBefore.receivables,
      availableForLoans: available,
      rotation: cycle.rotation,
      members,
    });
    expect(expected.distribution.ok).toBe(true);
    // The debtor keeps a real, unpaid debt: excluded by the pure rule itself.
    expect(
      expected.candidates.find((c) => c.membershipId === debtorId)?.outstandingDebt,
    ).toBeGreaterThan(0);
    expect(expected.eligibleCount).toBe(3);

    expect(await closeCycle(cycle.id)).toBe(true);
    const closed = await getPrisma().cycle.findUniqueOrThrow({ where: { id: cycle.id } });
    expect(closed.closedAt).not.toBeNull();
    const group = await getPrisma().group.findUniqueOrThrow({ where: { id: groupId } });
    expect(group.currentCycleId).toBeNull();
    const closedRounds = await getPrisma().round.findMany({ where: { cycleId: cycle.id } });
    expect(closedRounds.every((r) => r.status === 'CLOSED')).toBe(true);

    const ledger = await expectSoundLedger(groupId);
    const distribution = ledger.find((t) => t.type === 'FUND_DISTRIBUTION');
    expect(distribution).toBeTruthy();
    const shares = distribution!.postings.filter((p) => p.account.startsWith('payable:member:'));
    expect(shares).toHaveLength(3);
    expect(expected.distribution.ok).toBe(true);
    const expectedShare = expected.distribution.ok ? expected.distribution.share : 0;
    expect(shares.every((p) => p.amount === -expectedShare)).toBe(true);
    expect(shares.some((p) => p.account === `payable:member:${debtorId}`)).toBe(false);
    const generalFundPosting = distribution!.postings.find((p) => p.account === 'fund:general');
    expect(generalFundPosting?.amount).toBe(
      expected.distribution.ok ? expected.distribution.distributed : 0,
    );
    const closedEvent = ledger.find(
      (t) => t.type === 'EVENT' && (t.metadata as { event?: string })?.event === 'CYCLE_CLOSED',
    );
    expect(closedEvent?.metadata).toEqual({
      event: 'CYCLE_CLOSED',
      ...expected.event,
      cycleNumber: cycle.number,
      mode: 'FIXED',
    });

    // Idempotent: closing again changes nothing (no second FUND_DISTRIBUTION, no error).
    expect(await closeCycle(cycle.id)).toBe(false);
    expect(await closeDueCycles()).toBe(0);
    const ledgerAfter = await expectSoundLedger(groupId);
    expect(ledgerAfter.filter((t) => t.type === 'FUND_DISTRIBUTION')).toHaveLength(1);

    // The debtor still owes their fine; it was not forgiven by being left out.
    const debt = await getPrisma().obligation.findMany({
      where: { groupId, membershipId: debtorId, kind: 'FINE', status: 'DUE' },
    });
    expect(debt).toHaveLength(1);
  }, 30_000);
});

describe('leaving at the end of the cycle (R12.2, MEM-01, D40.5)', () => {
  it('pays the leaver their share, then ends their membership', async () => {
    const { groupId, everyone } = await fourMemberGroup();
    const leaver = everyone[1]!;
    await seedGeneralFund(groupId, everyone[0]!.membershipId, 12_000);
    const leaveCard = await api(leaver).post(`/v1/groups/${groupId}/leave`);
    expect(leaveCard.status).toBe(201);
    expect((await confirm(leaver, leaveCard.body.action.id)).status).toBe(200);
    expect(
      (await getPrisma().membership.findUniqueOrThrow({ where: { id: leaver.membershipId } }))
        .status,
    ).toBe('LEAVING');

    await playCycle(groupId, everyone);
    const cycle = await getPrisma().cycle.findFirstOrThrow({ where: { groupId } });
    expect(await closeCycle(cycle.id)).toBe(true);

    const membership = await getPrisma().membership.findUniqueOrThrow({
      where: { id: leaver.membershipId },
    });
    expect(membership.status).toBe('LEFT');
    expect(membership.leftAt).not.toBeNull();

    const ledger = await expectSoundLedger(groupId);
    const distribution = ledger.find((t) => t.type === 'FUND_DISTRIBUTION');
    expect(
      distribution?.postings.some((p) => p.account === `payable:member:${leaver.membershipId}`),
    ).toBe(true);
    expect(
      ledger.some(
        (t) =>
          t.type === 'EVENT' &&
          (t.metadata as { event?: string; membershipId?: string })?.event === 'MEMBER_LEFT' &&
          (t.metadata as { membershipId?: string }).membershipId === leaver.membershipId,
      ),
    ).toBe(true);

    // A former member can no longer read the group as a participant.
    const relogged = await relogin(leaver);
    const after = await api(relogged).get(`/v1/groups/${groupId}/overview`);
    expect(after.status).toBeGreaterThanOrEqual(400);
  });
});

describe('fewer than 3 members at the end of a cycle (D40.4)', () => {
  it('pauses the group; the admin invites directly until there are 3 again', async () => {
    const signedUp = await signUp();
    const created = await createGroup(signedUp);
    const groupId = created.groupId;
    await getPrisma().group.update({
      where: { id: groupId },
      data: { providerAccount: `test-${groupId}` },
    });
    const adminM: Member = { ...signedUp, membershipId: created.adminMembershipId };
    const m1 = await addMember(adminM, groupId);
    const m2 = await addMember(adminM, groupId);
    const startCard = await api(adminM).post(`/v1/groups/${groupId}/cycles/start`);
    expect((await confirm(adminM, startCard.body.action.id)).status).toBe(200);
    const everyone = [adminM, m1, m2];

    // m2 leaves at cycle end: only 2 will remain.
    const leaveCard = await api(m2).post(`/v1/groups/${groupId}/leave`);
    expect((await confirm(m2, leaveCard.body.action.id)).status).toBe(200);

    await playCycle(groupId, everyone);
    const cycle = await getPrisma().cycle.findFirstOrThrow({ where: { groupId } });
    expect(await closeCycle(cycle.id)).toBe(true);

    const admin = await relogin(adminM);
    const refused = await api(admin).post(`/v1/groups/${groupId}/cycles/start`);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('NOT_ENOUGH_MEMBERS');

    const next = await api(admin).get(`/v1/groups/${groupId}/cycles/next`);
    expect(next.body.participants).toBe(2);
    expect(next.body.canStart).toBe(false);

    // The admin invites directly (D40.4), as before the first cycle.
    const third = await addMember(admin, groupId);
    const ok = await api(admin).post(`/v1/groups/${groupId}/cycles/start`);
    expect(ok.status).toBe(201);
    expect((await confirm(admin, ok.body.action.id)).status).toBe(200);
    const started = await getPrisma().group.findUniqueOrThrow({ where: { id: groupId } });
    expect(started.currentCycleId).not.toBeNull();
    void third;
  });
});

describe('starting the next cycle keeps the previous order (D40.2, D40.3)', () => {
  it('kept order, same relative positions, round 1 opens for the participants', async () => {
    const { groupId, everyone } = await fourMemberGroup();
    const cycle1 = await getPrisma().cycle.findFirstOrThrow({ where: { groupId } });
    const previousOrder = cycle1.rotation;

    await playCycle(groupId, everyone);
    expect(await closeCycle(cycle1.id)).toBe(true);

    const admin = await relogin(everyone[0]!);
    const list = await api(admin).get(`/v1/groups/${groupId}/cycles`);
    expect(list.body.phase).toBe('BETWEEN_CYCLES');
    expect(list.body.current).toBeNull();

    const preview = await api(admin).get(`/v1/groups/${groupId}/cycles/next`);
    expect(preview.body.orderKind).toBe('KEPT');
    expect(preview.body.participants).toBe(4);
    expect(preview.body.order.map((o: { membershipId: string }) => o.membershipId)).toEqual(
      previousOrder,
    );

    const card = await api(admin).post(`/v1/groups/${groupId}/cycles/start`);
    expect(card.status).toBe(201);
    expect((await confirm(admin, card.body.action.id)).status).toBe(200);

    const cycle2 = await getPrisma().cycle.findFirstOrThrow({ where: { groupId, number: 2 } });
    expect(cycle2.rotation).toEqual(previousOrder);
    expect(cycle2.drawSeed).toBeNull();
    const round1 = await getPrisma().round.findFirstOrThrow({
      where: { cycleId: cycle2.id, number: 1 },
    });
    expect(round1.status).toBe('OPEN');
    const obligations = await getPrisma().obligation.findMany({
      where: { roundId: round1.id, kind: 'CONTRIBUTION' },
    });
    expect(obligations).toHaveLength(4);

    // Round 1 of cycle 2 is payable like any other.
    await payRound(groupId, everyone[0]!, 1);
    await settleBackground();
    await expectSoundLedger(groupId);
  });
});

describe('the round in progress after a payout (#76, rounds never closed before)', () => {
  it('is the newest open round, even when an earlier round is still in PAYOUT (older data)', async () => {
    const { groupId, admin } = await fourMemberGroup();
    const cycle = await getPrisma().cycle.findFirstOrThrow({ where: { groupId } });
    // The state production groups are in: round 1 paid out and never closed, round 2 open.
    await getPrisma().round.updateMany({
      where: { cycleId: cycle.id, number: 1 },
      data: { status: 'PAYOUT' },
    });
    await getPrisma().round.updateMany({
      where: { cycleId: cycle.id, number: 2 },
      data: { status: 'OPEN' },
    });
    const current = await api(admin).get(`/v1/groups/${groupId}/rounds/current`);
    expect(current.status).toBe(200);
    expect(current.body.round.number).toBe(2);
  });

  it('closes a round when the next one opens', async () => {
    const { groupId, everyone } = await fourMemberGroup();
    await playCycle(groupId, everyone);
    const cycle = await getPrisma().cycle.findFirstOrThrow({ where: { groupId } });
    const rounds = await getPrisma().round.findMany({
      where: { cycleId: cycle.id },
      orderBy: { number: 'asc' },
    });
    expect(rounds.map((r) => r.status)).toEqual(['CLOSED', 'CLOSED', 'CLOSED', 'PAYOUT']);
  });
});

describe('concurrent closes, reminders, leavers with debts, waiting installments', () => {
  it('two closes at once post one distribution; the admin is reminded once a week, never auto-started', async () => {
    const { groupId, everyone } = await fourMemberGroup();
    await seedGeneralFund(groupId, everyone[0]!.membershipId, 8_000);
    await playCycle(groupId, everyone);
    const cycle = await getPrisma().cycle.findFirstOrThrow({ where: { groupId } });
    const results = await Promise.all([closeCycle(cycle.id), closeCycle(cycle.id)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const ledger = await expectSoundLedger(groupId);
    expect(ledger.filter((t) => t.type === 'FUND_DISTRIBUTION')).toHaveLength(1);

    const adminUserId = everyone[0]!.id;
    const notices = () =>
      getPrisma().notification.count({
        where: { userId: adminUserId, groupId, titleEn: 'Choose when the next cycle starts' },
      });
    expect(await notices()).toBe(1); // told when the cycle closed
    const closedAt = (await getPrisma().cycle.findUniqueOrThrow({ where: { id: cycle.id } }))
      .closedAt!;
    const inDays = (d: number) => new Date(closedAt.getTime() + d * 86_400_000 + 60_000);
    await remindAdminsBetweenCycles(inDays(3));
    expect(await notices()).toBe(1); // not yet a week
    await remindAdminsBetweenCycles(inDays(8));
    await remindAdminsBetweenCycles(inDays(9));
    expect(await notices()).toBe(2); // once for week 1
    await remindAdminsBetweenCycles(inDays(15));
    expect(await notices()).toBe(3); // week 2
    // Nothing started the next cycle by itself.
    const group = await getPrisma().group.findUniqueOrThrow({ where: { id: groupId } });
    expect(group.currentCycleId).toBeNull();
  });

  it('a leaver who owes money leaves with no share and the debt stays owed (D40.5)', async () => {
    const { groupId, everyone } = await fourMemberGroup();
    const cycleBefore = await getPrisma().cycle.findFirstOrThrow({ where: { groupId } });
    // A member who is not the admin (the admin cannot announce leaving, D19) and is served before
    // the last round, then misses the round after their own: the debt cannot be settled from a
    // later payout of theirs, so it stays owed.
    const position = cycleBefore.rotation.findIndex(
      (id, i) => i <= 2 && id !== everyone[0]!.membershipId,
    );
    const leaverId = cycleBefore.rotation[position]!;
    const leaver = everyone.find((m) => m.membershipId === leaverId)!;
    await seedGeneralFund(groupId, everyone[0]!.membershipId, 12_000);
    const card = await api(leaver).post(`/v1/groups/${groupId}/leave`);
    expect(card.status).toBe(201);
    expect((await confirm(leaver, card.body.action.id)).status).toBe(200);
    await playCycle(groupId, everyone, { unpaid: [{ member: leaver, round: position + 2 }] });
    expect(await closeCycle(cycleBefore.id)).toBe(true);

    const membership = await getPrisma().membership.findUniqueOrThrow({ where: { id: leaverId } });
    expect(membership.status).toBe('LEFT');
    const ledger = await expectSoundLedger(groupId);
    const distribution = ledger.find((t) => t.type === 'FUND_DISTRIBUTION');
    expect(distribution?.postings.some((p) => p.account === `payable:member:${leaverId}`)).toBe(
      false,
    );
    const stillOwed = await getPrisma().obligation.count({
      where: { groupId, membershipId: leaverId, status: 'DUE' },
    });
    expect(stillOwed).toBeGreaterThan(0);
  });

  it('loan installments that waited for the next cycle take its round deadlines (D18.2)', async () => {
    const { groupId, everyone } = await fourMemberGroup();
    const borrower = everyone[1]!;
    await playCycle(groupId, everyone);
    const cycle = await getPrisma().cycle.findFirstOrThrow({ where: { groupId } });
    expect(await closeCycle(cycle.id)).toBe(true);
    // A loan sent in the last round, its two installments waiting (no round yet, projected dates).
    const loan = await getPrisma().loan.create({
      data: {
        groupId,
        membershipId: borrower.membershipId,
        principal: 20_000,
        months: 2,
        ratePermille: 50,
        interest: 2_000,
        feeEstimated: 500,
        totalDue: 22_500,
        status: 'DISBURSED',
        decidedAt: new Date(),
      },
    });
    const projected = new Date(Date.now() + 400 * 86_400_000);
    await getPrisma().obligation.createMany({
      data: [11_250, 11_250].map((amount, i) => ({
        groupId,
        membershipId: borrower.membershipId,
        kind: 'LOAN_INSTALLMENT' as const,
        loanId: loan.id,
        roundId: null,
        amount,
        dueAt: new Date(projected.getTime() + i * 30 * 86_400_000),
      })),
    });

    const admin = await relogin(everyone[0]!);
    const card = await api(admin).post(`/v1/groups/${groupId}/cycles/start`);
    expect(card.status).toBe(201);
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
    // Monthly group: installment k is due at the deadline of the k-th round of the new cycle.
    expect(installments.map((o) => o.roundId)).toEqual([rounds[0]!.id, rounds[1]!.id]);
    expect(installments.map((o) => o.dueAt.getTime())).toEqual([
      rounds[0]!.dueAt.getTime(),
      rounds[1]!.dueAt.getTime(),
    ]);
  });
});
