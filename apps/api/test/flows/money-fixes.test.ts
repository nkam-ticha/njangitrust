// Fixes found by the ledger audit of the money code, each proved on the real services:
//   1. a withdrawal or a payment sends exactly the card the member confirmed (re-checked under the
//      locks, not only before them);
//   3. the beneficiary's "debts due" is what a withdrawal holds back;
//   4. closing the bids twice, or a round that is not open, writes nothing;
//   5. the solidarity send takes the group lock before the request's (no deadlock with a writer
//      that holds the group);
//   6. a group a developer closed is checked with the ledger but its members get no notice (D28).
import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { advanceTestClock, resetTestClock } from '../../src/lib/clock';
import { getPrisma } from '../../src/lib/prisma';
import { closeBidding } from '../../src/modules/bids/bids.close';
import { getActionHandler } from '../../src/modules/pending-actions';
import { openPayout } from '../../src/modules/payouts';
import {
  resetPaymentProviderForTests,
  setPaymentProviderForTests,
  MockProvider,
} from '../../src/modules/providers';
import { runDailyReconciliation } from '../../src/modules/reconciliation';
import { paySolidarity } from '../../src/modules/solidarity/solidarity.money';
import { settleBackground } from '../../src/jobs/dispatch';
import { api, type TestUser } from '../helpers/client';
import { addMember, confirm, createGroup, signUp } from '../helpers/factories';
import { ledgerOf, payRoundOne, realGroup } from '../helpers/money-flows';

type Member = TestUser & { membershipId: string };

afterEach(() => {
  resetTestClock();
  resetPaymentProviderForTests();
});

/**
 * Runs `change` after the confirmation has compared the card and just before `execute` takes its
 * locks: the window in which another commit can land. Restores the handler afterwards.
 */
async function withCommitBeforeExecute<T>(
  type: string,
  change: () => Promise<void>,
  body: () => Promise<T>,
): Promise<T> {
  const handler = getActionHandler(type)!;
  const original = handler.execute.bind(handler);
  handler.execute = async (ctx, args) => {
    await change();
    return original(ctx, args);
  };
  try {
    return await body();
  } finally {
    handler.execute = original;
  }
}

async function loginAgain(member: Member): Promise<Member> {
  const res = await api(null, { ownPhones: [member.phone, member.paymentNumber] }).post(
    '/v1/auth/login',
    { phone: member.phone, pin: member.pin },
  );
  expect(res.status).toBe(200);
  return { ...member, accessToken: res.body.session.accessToken as string };
}

describe('a payment or a withdrawal sends exactly the confirmed card (rule 5)', () => {
  let world: Awaited<ReturnType<typeof realGroup>>;
  let roundId: string;
  let beneficiary: Member;

  const obligationOf = (member: Member) =>
    getPrisma().obligation.findFirstOrThrow({
      where: { roundId, membershipId: member.membershipId, kind: 'CONTRIBUTION' },
    });

  beforeAll(async () => {
    world = await realGroup();
    roundId = world.rounds[0]!.id;
    beneficiary = world.everyone.find(
      (m) => m.membershipId === world.rounds[0]!.beneficiaryMembershipId,
    )!;
  });

  it('PAY: a total that changes between the check and the lock sends nothing', async () => {
    const payer = world.everyone.find((m) => m.membershipId !== beneficiary.membershipId)!;
    const obligation = await obligationOf(payer);
    const card = await api(payer).post(`/v1/groups/${world.groupId}/payments`, {
      obligationIds: [obligation.id],
    });
    expect(card.status).toBe(201);

    const refused = await withCommitBeforeExecute(
      'PAY',
      async () => {
        await getPrisma().obligation.update({
          where: { id: obligation.id },
          data: { amount: obligation.amount + 500 },
        });
      },
      () => confirm(payer, card.body.action.id),
    );
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('ACTION_CHANGED');
    expect(refused.body.messageFr).toBeTruthy();
    expect(refused.body.messageEn).toBeTruthy();
    expect(
      await getPrisma().paymentIntent.count({ where: { membershipId: payer.membershipId } }),
    ).toBe(0);
    const failed = await getPrisma().pendingAction.findUniqueOrThrow({
      where: { id: card.body.action.id },
    });
    expect(failed).toMatchObject({ status: 'FAILED', failureCode: 'ACTION_CHANGED' });

    // Put the amount back: the same payment, prepared again, goes through as before.
    await getPrisma().obligation.update({
      where: { id: obligation.id },
      data: { amount: obligation.amount },
    });
    const intentId = await payRoundOne(world.groupId, payer);
    expect(
      (await getPrisma().paymentIntent.findUniqueOrThrow({ where: { id: intentId } })).status,
    ).toBe('SUCCESSFUL');
  });

  it('WITHDRAW: an "all" amount that changes between the check and the lock sends nothing', async () => {
    for (const member of world.everyone) {
      if ((await obligationOf(member)).status === 'DUE') await payRoundOne(world.groupId, member);
    }
    const round = await getPrisma().round.findUniqueOrThrow({ where: { id: roundId } });
    advanceTestClock(round.payoutAt.getTime() - Date.now() + 60_000);
    expect(await openPayout(roundId, new Date(round.payoutAt.getTime() + 60_000))).toBe(true);

    // Weeks later the session has expired: the beneficiary signs in again.
    beneficiary = await loginAgain(beneficiary);
    const card = await api(beneficiary).post(`/v1/groups/${world.groupId}/withdrawals`, {
      amount: 'ALL',
    });
    expect(card.status).toBe(201);
    const shown = card.body.action.preview.lines[0].amount as number;
    expect(shown).toBeGreaterThan(0);

    // A debt falls due after the confirmation compared the card: "all" is now a smaller amount.
    await withCommitBeforeExecute(
      'WITHDRAW',
      async () => {
        await getPrisma().obligation.create({
          data: {
            groupId: world.groupId,
            membershipId: beneficiary.membershipId,
            kind: 'FINE',
            amount: 1_000,
            dueAt: new Date(round.payoutAt.getTime() - 1_000),
          },
        });
      },
      async () => {
        const refused = await confirm(beneficiary, card.body.action.id);
        expect(refused.status).toBe(409);
        expect(refused.body.code).toBe('ACTION_CHANGED');
      },
    );
    expect(
      await getPrisma().disbursement.count({ where: { membershipId: beneficiary.membershipId } }),
    ).toBe(0);
    const ledger = await ledgerOf(world.groupId);
    expect(ledger.some((entry) => entry.type === 'DISBURSEMENT_SENT')).toBe(false);
    const failed = await getPrisma().pendingAction.findUniqueOrThrow({
      where: { id: card.body.action.id },
    });
    expect(failed).toMatchObject({ status: 'FAILED', failureCode: 'ACTION_CHANGED' });

    // The member asks again and sees the new, smaller amount: that card is what is sent.
    const again = await api(beneficiary).post(`/v1/groups/${world.groupId}/withdrawals`, {
      amount: 'ALL',
    });
    expect(again.status).toBe(201);
    const smaller = again.body.action.preview.lines[0].amount as number;
    expect(smaller).toBeLessThan(shown);
    const done = await confirm(beneficiary, again.body.action.id);
    expect(done.status).toBe(200);
    const sent = await getPrisma().disbursement.findFirstOrThrow({
      where: { membershipId: beneficiary.membershipId },
    });
    expect(sent.amount).toBe(smaller);
  });
});

describe('the beneficiary’s debts due are what a withdrawal holds back (D13.3, D18)', () => {
  it('counts every kind of debt due, corrections included, in the whole group, and none not yet due', async () => {
    const { groupId, everyone, rounds } = await realGroup();
    const round = rounds[0]!;
    const beneficiary = everyone.find((m) => m.membershipId === round.beneficiaryMembershipId)!;
    const other = everyone.find((m) => m.membershipId !== round.beneficiaryMembershipId)!;
    const past = new Date(Date.now() - 86_400_000);
    const later = new Date(Date.now() + 86_400_000);
    const debt = (
      kind: 'CORRECTION' | 'FINE' | 'BID',
      amount: number,
      dueAt: Date,
      round?: string,
    ) =>
      getPrisma().obligation.create({
        data: {
          groupId,
          membershipId: beneficiary.membershipId,
          kind,
          amount,
          dueAt,
          ...(round ? { roundId: round } : {}),
        },
      });
    await debt('CORRECTION', 700, past);
    await debt('FINE', 300, past);
    await debt('BID', 400, past, round.id);
    await debt('FINE', 900, later);
    // Another member's debt is never counted for the beneficiary.
    await getPrisma().obligation.create({
      data: { groupId, membershipId: other.membershipId, kind: 'FINE', amount: 5_000, dueAt: past },
    });

    const breakdown = await api(beneficiary).get(`/v1/groups/${groupId}/rounds/1/payout-breakdown`);
    expect(breakdown.status).toBe(200);
    expect(breakdown.body.debtsDue).toBe(1_400);
    const mine = await api(beneficiary).get(`/v1/groups/${groupId}/me/money`);
    expect(mine.body.money.debtsDue).toBe(1_400);
    expect(breakdown.body.debtsDue).toBe(mine.body.money.debtsDue);

    // Someone else reads the same round and learns nothing of it.
    const seenByOther = await api(other).get(`/v1/groups/${groupId}/rounds/1/payout-breakdown`);
    expect(seenByOther.body.debtsDue).toBe(0);
  });
});

describe('the breakdown and a withdrawal agree on the next withdrawal (D13.3)', () => {
  it('holds back a due debt that auto-settlement has not taken, in both', async () => {
    const world = await realGroup();
    const round = world.rounds[0]!;
    const beneficiary = world.everyone.find(
      (m) => m.membershipId === round.beneficiaryMembershipId,
    )!;
    for (const member of world.everyone) {
      const due = await getPrisma().obligation.findFirst({
        where: { roundId: round.id, membershipId: member.membershipId, kind: 'CONTRIBUTION' },
      });
      if (due?.status === 'DUE') await payRoundOne(world.groupId, member);
    }
    advanceTestClock(round.payoutAt.getTime() - Date.now() + 60_000);
    expect(await openPayout(round.id, new Date(round.payoutAt.getTime() + 60_000))).toBe(true);
    const me = await loginAgain(beneficiary);

    const before = await api(me).get(`/v1/groups/${world.groupId}/rounds/1/payout-breakdown`);
    const free = before.body.breakdown.nextWithdrawal.maxAmount as number;
    expect(free).toBeGreaterThan(5_000);

    // A debt that fell due after the payout, which no settlement took.
    await getPrisma().obligation.create({
      data: {
        groupId: world.groupId,
        membershipId: me.membershipId,
        kind: 'FINE',
        amount: 5_000,
        dueAt: new Date(round.payoutAt.getTime() - 1_000),
      },
    });

    const after = await api(me).get(`/v1/groups/${world.groupId}/rounds/1/payout-breakdown`);
    const money = await api(me).get(`/v1/groups/${world.groupId}/me/money`);
    const shown = after.body.breakdown.nextWithdrawal.maxAmount as number;
    expect(shown).toBeLessThan(free);
    // What the breakdown offers is what a withdrawal allows: the two cannot disagree.
    expect(shown).toBe(money.body.money.available);
  });
});

describe('closing the bids (R8.3, D10)', () => {
  async function biddingGroup() {
    const user = await signUp();
    const created = await createGroup(user, { rules: { rotationMode: 'BIDDING' } });
    const admin: Member = { ...user, membershipId: created.adminMembershipId };
    await addMember(admin, created.groupId);
    await addMember(admin, created.groupId);
    const card = await api(admin).post(`/v1/groups/${created.groupId}/cycles/start`);
    expect((await confirm(admin, card.body.action.id)).status).toBe(200);
    const rounds = await getPrisma().round.findMany({
      where: { groupId: created.groupId },
      orderBy: { number: 'asc' },
    });
    return { groupId: created.groupId, rounds };
  }
  const farFuture = () => new Date(Date.now() + 400 * 86_400_000);

  it('writes nothing for a round that is not open yet (it was committed before, then reported false)', async () => {
    const { groupId, rounds } = await biddingGroup();
    const second = rounds[1]!;
    expect(second.status).toBe('SCHEDULED');
    const before = (await ledgerOf(groupId)).length;
    expect(await closeBidding(second.id, farFuture())).toBe(false);
    expect((await ledgerOf(groupId)).length).toBe(before);
    expect(
      (await getPrisma().round.findUniqueOrThrow({ where: { id: second.id } }))
        .beneficiaryMembershipId,
    ).toBeNull();
  });

  it('closes an open round once, and a second close writes nothing', async () => {
    const { groupId, rounds } = await biddingGroup();
    const first = rounds[0]!;
    expect(first.status).toBe('OPEN');
    const now = farFuture();
    expect(await closeBidding(first.id, now)).toBe(true);
    const after = (await ledgerOf(groupId)).length;
    const obligations = await getPrisma().obligation.count({ where: { groupId } });
    expect(await closeBidding(first.id, now)).toBe(false);
    expect((await ledgerOf(groupId)).length).toBe(after);
    expect(await getPrisma().obligation.count({ where: { groupId } })).toBe(obligations);
  });

  it('writes nothing for a round already paid out whose beneficiary was never recorded', async () => {
    const { groupId, rounds } = await biddingGroup();
    const first = rounds[0]!;
    await getPrisma().round.update({ where: { id: first.id }, data: { status: 'CLOSED' } });
    const before = (await ledgerOf(groupId)).length;
    expect(await closeBidding(first.id, farFuture())).toBe(false);
    expect((await ledgerOf(groupId)).length).toBe(before);
  });
});

describe('the solidarity send takes the group lock first (D28.4)', () => {
  it('does not deadlock with a writer that holds the group and then wants the request', async () => {
    const { groupId, admin } = await realGroup();
    const request = await getPrisma().solidarityRequest.create({
      data: {
        groupId,
        requesterMembershipId: admin.membershipId,
        recipientMembershipId: admin.membershipId,
        event: 'DEUIL',
        amount: 1_000,
        status: 'APPROVED',
      },
    });
    let sending: Promise<void> = Promise.resolve();
    const writer = getPrisma().$transaction(
      async (tx) => {
        // The writer holds the group, as every ledger writer and a developer's closing do.
        await tx.$queryRaw`SELECT "id" FROM "Group" WHERE "id" = ${groupId}::uuid FOR UPDATE`;
        sending = getPrisma().$transaction(
          (other) =>
            paySolidarity(other, {
              groupId,
              solidarityRequestId: request.id,
              proposalId: randomUUID(),
            }),
          { timeout: 20_000, maxWait: 10_000 },
        );
        sending.catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 700));
        // Then it wants the request. If the send already holds the request while waiting for the
        // group, each waits for the other and the database aborts one (deadlock detected).
        await tx.$queryRaw`SELECT "id" FROM "SolidarityRequest" WHERE "id" = ${request.id}::uuid FOR UPDATE`;
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
    const results = await Promise.allSettled([writer]);
    const sent = await Promise.allSettled([sending]);
    expect(results[0]).toMatchObject({ status: 'fulfilled' });
    expect(sent[0]).toMatchObject({ status: 'fulfilled' });
    // Behaviour unchanged: the fund is empty, so the request is left waiting, nothing is sent.
    expect(
      await getPrisma().disbursement.count({ where: { groupId, purpose: 'SOLIDARITY' } }),
    ).toBe(0);
    expect(
      (await getPrisma().solidarityRequest.findUniqueOrThrow({ where: { id: request.id } })).status,
    ).toBe('APPROVED');
  });
});

describe('the daily check and the groups a developer closed (D28)', () => {
  it('keeps a closed group in the ledger check but sends its members no notice', async () => {
    const providerAccount = `test-shared-${randomUUID()}`;
    const make = async () => {
      const user = await signUp();
      const created = await createGroup(user);
      const other = await addMember(user, created.groupId);
      await getPrisma().group.update({ where: { id: created.groupId }, data: { providerAccount } });
      return { groupId: created.groupId, users: [user, other] };
    };
    const open = await make();
    const closed = await make();
    await getPrisma().group.update({
      where: { id: closed.groupId },
      data: { status: 'CLOSED', hiddenByDeveloperAt: new Date() },
    });
    // The operator's balance cannot be read: the check is an ALERT whatever the groups hold.
    const real = new MockProvider();
    setPaymentProviderForTests({
      requestPayment: (input) => real.requestPayment(input),
      getPaymentStatus: (ref) => real.getPaymentStatus(ref),
      disburse: (input) => real.disburse(input),
      getDisbursementStatus: (ref) => real.getDisbursementStatus(ref),
      getBalance: () => Promise.reject(new Error('operator unreachable')),
    });
    advanceTestClock(1_000);
    const run = await runDailyReconciliation(providerAccount);
    await settleBackground();
    expect(run.status).toBe('ALERT');
    // Both groups are in the check...
    const details = run.details as { groups: { groupId: string }[] };
    expect(details.groups.map((g) => g.groupId).sort()).toEqual(
      [open.groupId, closed.groupId].sort(),
    );
    // ...but only the open one's members are told.
    for (const user of open.users) {
      expect(
        await getPrisma().notification.count({
          where: { userId: user.id, groupId: open.groupId, deepLink: '/caisse' },
        }),
      ).toBe(1);
    }
    for (const user of closed.users) {
      expect(
        await getPrisma().notification.count({
          where: { userId: user.id, groupId: closed.groupId, deepLink: '/caisse' },
        }),
      ).toBe(0);
    }
  });
});
