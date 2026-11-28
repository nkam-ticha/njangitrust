// Findings of the ledger audit and the cross-review of the end-of-cycle work (#76): a member who
// left and came back, an installment paid early, the group lock when a round opens, the weekly
// reminder, a ledger-only debt, the start card. Each test fails without its fix.
import {
  fineAssessedPostings,
  verifyLedgerExport,
  type LedgerExport,
  type LedgerTransaction,
} from '@njangi/rules';
import { afterEach, describe, expect, it } from 'vitest';
import { resetTestClock } from '../../src/lib/clock';
import { getPrisma } from '../../src/lib/prisma';
import { closeCycle, openRound, remindAdminsBetweenCycles } from '../../src/modules/cycles';
import { openPayout } from '../../src/modules/payouts';
import { api, type TestUser } from '../helpers/client';
import { goTo, playCycle, relogin, seedGeneralFund } from '../helpers/cycle-flows';
import { addMember, confirm, createGroup, inviteToken, signUp } from '../helpers/factories';
import { appendLedger, entryOf } from '../helpers/ledger-seed';
import { expectSoundLedger } from '../helpers/money-flows';

type Member = TestUser & { membershipId: string };

afterEach(() => resetTestClock());

async function startedGroup(others: number) {
  const signedUp = await signUp();
  const created = await createGroup(signedUp);
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

describe('M1, L7: a member who left and is invited again is a newcomer', () => {
  it('goes last in the kept order, and the export still verifies', async () => {
    const { groupId, admin: adminM, everyone } = await startedGroup(2);
    const cycle1 = await getPrisma().cycle.findFirstOrThrow({ where: { groupId } });
    // A non-admin who is not last, so "old slot" and "last" differ.
    const position = cycle1.rotation.findIndex((id) => id !== adminM.membershipId);
    expect(position).toBeLessThan(2);
    const leaver = everyone.find((m) => m.membershipId === cycle1.rotation[position])!;
    const card = await api(leaver).post(`/v1/groups/${groupId}/leave`);
    expect((await confirm(leaver, card.body.action.id)).status).toBe(200);
    await playCycle(groupId, everyone);
    expect(await closeCycle(cycle1.id)).toBe(true);
    expect(
      (await getPrisma().membership.findUniqueOrThrow({ where: { id: leaver.membershipId } }))
        .status,
    ).toBe('LEFT');

    // Two members remain: the admin invites directly (D40.4) and the same person returns.
    const admin = await relogin(adminM);
    const token = await inviteToken(admin, groupId, { name: leaver.name, phone: leaver.phone });
    const back = await relogin(leaver);
    const accepted = await api(back).post(`/v1/auth/invites/${token}/accept`, { mode: 'existing' });
    expect(accepted.status).toBeLessThan(300);

    const staying = cycle1.rotation.filter((id) => id !== leaver.membershipId);
    const preview = await api(admin).get(`/v1/groups/${groupId}/cycles/next`);
    const order = preview.body.order.map((o: { membershipId: string }) => o.membershipId);
    expect(order).toEqual([...staying, leaver.membershipId]);
    expect(preview.body.newcomers).toBe(1);

    const startCard = await api(admin).post(`/v1/groups/${groupId}/cycles/start`);
    expect((await confirm(admin, startCard.body.action.id)).status).toBe(200);
    const cycle2 = await getPrisma().cycle.findFirstOrThrow({ where: { groupId, number: 2 } });
    expect(cycle2.rotation).toEqual([...staying, leaver.membershipId]);

    const exported = await api(admin).get(`/v1/groups/${groupId}/ledger/export?format=json`);
    expect(exported.status).toBe(200);
    expect(verifyLedgerExport(exported.body as LedgerExport).problems).toEqual([]);
    const ledger: LedgerTransaction[] = await expectSoundLedger(groupId);
    const started = ledger.find(
      (t) =>
        (t.metadata as { event?: string })?.event === 'CYCLE_STARTED' &&
        (t.metadata as { cycleNumber?: number }).cycleNumber === 2,
    );
    expect(started?.metadata).toMatchObject({ orderSource: 'CARRIED' });
    expect(
      Object.keys((started?.metadata as { newcomerJoinedAt: object }).newcomerJoinedAt),
    ).toEqual([leaver.membershipId]);
  }, 60_000);
});

describe('M2: an installment paid early holds its place', () => {
  it('the next waiting installment lands on round 2 of the new cycle', async () => {
    const { groupId, everyone } = await startedGroup(3);
    const borrower = everyone[1]!;
    await playCycle(groupId, everyone);
    const cycle = await getPrisma().cycle.findFirstOrThrow({ where: { groupId } });
    const oldRound = (await getPrisma().round.findMany({ where: { cycleId: cycle.id } }))[3]!;
    expect(await closeCycle(cycle.id)).toBe(true);
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
        decidedAt: new Date(),
      },
    });
    const day = 86_400_000;
    const base = Date.now() + 400 * day;
    await getPrisma().obligation.createMany({
      data: [
        { roundId: oldRound.id, status: 'PAID' as const, dueAt: oldRound.dueAt },
        { roundId: null, status: 'PAID' as const, dueAt: new Date(base) },
        { roundId: null, status: 'DUE' as const, dueAt: new Date(base + 30 * day) },
      ].map((row) => ({
        groupId,
        membershipId: borrower.membershipId,
        kind: 'LOAN_INSTALLMENT' as const,
        loanId: loan.id,
        amount: 11_666,
        ...row,
      })),
    });
    const admin = await relogin(everyone[0]!);
    const card = await api(admin).post(`/v1/groups/${groupId}/cycles/start`);
    expect((await confirm(admin, card.body.action.id)).status).toBe(200);
    const cycle2 = await getPrisma().cycle.findFirstOrThrow({ where: { groupId, number: 2 } });
    const round2 = await getPrisma().round.findFirstOrThrow({
      where: { cycleId: cycle2.id, number: 2 },
    });
    const third = await getPrisma().obligation.findFirstOrThrow({
      where: { loanId: loan.id, status: 'DUE' },
    });
    expect(third.roundId).toBe(round2.id);
    expect(third.dueAt.getTime()).toBe(round2.dueAt.getTime());
    // The one paid early is left as it was.
    expect(
      await getPrisma().obligation.count({
        where: { loanId: loan.id, status: 'PAID', roundId: null },
      }),
    ).toBe(1);
  }, 60_000);
});

describe('M3, M4: opening a round', () => {
  it('reads its beneficiary after the group lock (a rotation change in flight)', async () => {
    const { groupId } = await startedGroup(3);
    const cycle = await getPrisma().cycle.findFirstOrThrow({ where: { groupId } });
    const rounds = await getPrisma().round.findMany({
      where: { cycleId: cycle.id },
      orderBy: { number: 'asc' },
    });
    goTo(new Date(rounds[0]!.payoutAt.getTime() + 60_000));
    expect(await openPayout(rounds[0]!.id)).toBe(true);
    const newBeneficiary = cycle.rotation[3]!;
    expect(rounds[1]!.beneficiaryMembershipId).not.toBe(newBeneficiary);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const hasLock = new Promise<void>((resolve) => (locked = resolve));
    // A rotation change in flight: group locked, round 2's beneficiary changed, not yet committed.
    const holder = getPrisma().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Group" WHERE "id" = ${groupId}::uuid FOR UPDATE`;
      await tx.round.update({
        where: { id: rounds[1]!.id },
        data: { beneficiaryMembershipId: newBeneficiary },
      });
      locked();
      await gate;
    });
    await hasLock;
    const opening = openRound(rounds[1]!.id);
    await new Promise((resolve) => setTimeout(resolve, 800));
    release();
    await holder;
    expect(await opening).toBe(true);
    const owed = await getPrisma().obligation.findMany({
      where: { roundId: rounds[1]!.id, kind: 'CONTRIBUTION' },
      select: { creditorMembershipId: true },
    });
    expect(owed.length).toBeGreaterThan(0);
    expect(owed.every((o) => o.creditorMembershipId === newBeneficiary)).toBe(true);
  }, 30_000);
});

describe('L8: the weekly reminder', () => {
  it('follows the latest cycle, not an older closed one', async () => {
    const { groupId, everyone } = await startedGroup(3);
    await playCycle(groupId, everyone);
    const cycle = await getPrisma().cycle.findFirstOrThrow({ where: { groupId } });
    expect(await closeCycle(cycle.id)).toBe(true);
    const closedAt = (await getPrisma().cycle.findUniqueOrThrow({ where: { id: cycle.id } }))
      .closedAt!;
    // An older cycle closed long ago must not make the group look as if it had waited for weeks.
    await getPrisma().cycle.create({
      data: {
        groupId,
        number: 0,
        mode: 'FIXED',
        firstPayoutAt: new Date(closedAt.getTime() - 90 * 86_400_000),
        startedAt: new Date(closedAt.getTime() - 120 * 86_400_000),
        closedAt: new Date(closedAt.getTime() - 60 * 86_400_000),
      },
    });
    const notices = () =>
      getPrisma().notification.count({
        where: { userId: everyone[0]!.id, groupId, titleEn: 'Choose when the next cycle starts' },
      });
    expect(await notices()).toBe(1);
    await remindAdminsBetweenCycles(new Date(closedAt.getTime() + 2 * 86_400_000));
    expect(await notices()).toBe(1);
  }, 60_000);
});

describe('X3, X5: what a member and the admin are shown', () => {
  it('a member who owes only in the ledger is shown as owing, not 0', async () => {
    const { groupId, everyone } = await startedGroup(3);
    const target = everyone[1]!;
    // A debt in the ledger with no obligation row: still outstanding for the close rule (R7.8).
    await appendLedger(groupId, [
      entryOf(
        'FINE_ASSESSED',
        fineAssessedPostings({ membershipId: target.membershipId, amount: 1_000 }),
        { membershipId: target.membershipId },
      ),
    ]);
    await seedGeneralFund(groupId, everyone[0]!.membershipId, 9_000);
    await playCycle(groupId, everyone);
    const cycle = await getPrisma().cycle.findFirstOrThrow({ where: { groupId } });
    expect(await closeCycle(cycle.id)).toBe(true);
    const summary = await api(await relogin(target)).get(`/v1/groups/${groupId}/cycles/1`);
    expect(summary.status).toBe(200);
    expect(summary.body.mine).toMatchObject({ outcome: 'DEBT', share: 0, owed: 1_000 });
  }, 60_000);

  it('the start card says the date must still be valid when confirmed', async () => {
    const { groupId, everyone } = await startedGroup(3);
    await playCycle(groupId, everyone);
    const cycle = await getPrisma().cycle.findFirstOrThrow({ where: { groupId } });
    expect(await closeCycle(cycle.id)).toBe(true);
    const admin = await relogin(everyone[0]!);
    const card = await api(admin).post(`/v1/groups/${groupId}/cycles/start`);
    expect(card.status).toBe(201);
    const notes = JSON.stringify(card.body.action.preview.notes);
    expect(notes).toMatch(/encore être valide/);
    expect(notes).toMatch(/still be valid/);
  }, 60_000);
});
