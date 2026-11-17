// Scenarios the sixth ledger audit of the governance money operations asked for: a second exit
// onto a round that already has obligations, a fine that a payment in progress is paying, and a
// clawback released when the payout that caused it fails (owner Q1, Q3).
import { afterEach, describe, expect, it } from 'vitest';
import { advanceTestClock, resetTestClock } from '../../src/lib/clock';
import { settleBackground } from '../../src/jobs/dispatch';
import { getPrisma } from '../../src/lib/prisma';
import { assessRoundFines } from '../../src/modules/fines';
import { pollDisbursement } from '../../src/modules/payouts/withdrawals.service';
import { MOCK_CONFIRMATION_MS } from '../../src/modules/providers/mock-provider';
import { api } from '../helpers/client';
import { confirm } from '../helpers/factories';
import { propose, type Member } from '../helpers/governance';
import {
  expectSoundLedger,
  fundBalance,
  ledgerOf,
  pass,
  payRoundOne,
  realGroup,
} from '../helpers/money-flows';

afterEach(() => resetTestClock());

async function loginAgain(member: Member): Promise<Member> {
  const res = await api(null, { ownPhones: [member.phone, member.paymentNumber] }).post(
    '/v1/auth/login',
    { phone: member.phone, pin: member.pin },
  );
  expect(res.status).toBe(200);
  return { ...member, accessToken: res.body.session.accessToken as string };
}

/** The rotation forced to this order, so a test knows who is served first. */
async function forceRotation(groupId: string, order: Member[]) {
  const cycle = await getPrisma().cycle.findFirstOrThrow({ where: { groupId } });
  const ids = order.map((m) => m.membershipId);
  await getPrisma().cycle.update({ where: { id: cycle.id }, data: { rotation: ids } });
  const rounds = await getPrisma().round.findMany({
    where: { cycleId: cycle.id },
    orderBy: { number: 'asc' },
  });
  for (const round of rounds) {
    await getPrisma().round.update({
      where: { id: round.id },
      data: { beneficiaryMembershipId: ids[round.number - 1]! },
    });
  }
  await getPrisma().obligation.updateMany({
    where: { roundId: rounds[0]!.id, kind: { in: ['CONTRIBUTION', 'SOLIDARITY'] } },
    data: { creditorMembershipId: ids[0]! },
  });
}

describe('exits, corrections and releases after the ledger audit', () => {
  it('closes the last round instead of deleting it when it already has obligations', async () => {
    const { groupId, admin, members, everyone } = await realGroup();
    const [first, second, third] = members as [Member, Member, Member];
    await forceRotation(groupId, [first, second, admin, third]);
    // The served member leaves: they keep owing every round still to come, the last one included.
    const served = await propose(first, groupId, { type: 'EARLY_EXIT', reason: 'Je pars' });
    await pass(
      everyone.filter((m) => m.membershipId !== first.membershipId),
      served,
    );
    const rounds = await getPrisma().round.findMany({
      where: { groupId },
      orderBy: { number: 'asc' },
    });
    expect(rounds).toHaveLength(4);
    expect(
      await getPrisma().obligation.count({
        where: { roundId: rounds[3]!.id, membershipId: first.membershipId, status: 'DUE' },
      }),
    ).toBeGreaterThan(0);

    // Another member, not yet served, leaves: the vote must still apply.
    const exit = await propose(second, groupId, { type: 'EARLY_EXIT', reason: 'Je déménage' });
    await pass([admin, third], exit);
    expect(
      (await getPrisma().membership.findUniqueOrThrow({ where: { id: second.membershipId } }))
        .status,
    ).toBe('LEFT');
    const after = await getPrisma().round.findMany({
      where: { groupId },
      orderBy: { number: 'asc' },
    });
    const last = after[3]!;
    expect(last).toMatchObject({ status: 'CLOSED', beneficiaryMembershipId: null });
    expect(await getPrisma().obligation.count({ where: { roundId: last.id, status: 'DUE' } })).toBe(
      0,
    );
    await expectSoundLedger(groupId);
  });

  it('keeps an exit vote and a payment from overlapping', async () => {
    const { groupId, members } = await realGroup();
    const [paying, leaving] = members as [Member, Member];
    const dueOf = async (member: Member) =>
      ((await api(member).get(`/v1/groups/${groupId}/me/dues`)).body.dues as { id: string }[]).map(
        (due) => due.id,
      );

    // A payment the operator has not answered yet: no exit vote can open for that member.
    const card = await api(paying).post(`/v1/groups/${groupId}/payments`, {
      obligationIds: await dueOf(paying),
    });
    expect((await confirm(paying, card.body.action.id)).status).toBe(200);
    const refused = await api(paying).post(`/v1/groups/${groupId}/proposals`, {
      type: 'EARLY_EXIT',
      reason: 'Je pars',
    });
    expect(refused.body.code).toBe('EXIT_PAYMENT_IN_PROGRESS');

    // An open exit vote: that member cannot start a payment until it has closed.
    await propose(leaving, groupId, { type: 'EARLY_EXIT', reason: 'Je pars' });
    const blocked = await api(leaving).post(`/v1/groups/${groupId}/payments`, {
      obligationIds: await dueOf(leaving),
    });
    expect(blocked.body.code).toBe('PAYMENT_BLOCKED_BY_EXIT_VOTE');
  });

  it('refuses to correct a fine that a payment in progress is paying', async () => {
    const { groupId, admin, members, rounds } = await realGroup();
    const late = members[2]!;
    const round = rounds[0]!;
    for (const member of [admin, members[0]!, members[1]!]) await payRoundOne(groupId, member);
    advanceTestClock(round.dueAt.getTime() - Date.now() + 60_000);
    expect(await assessRoundFines(round.id, new Date(round.dueAt.getTime() + 60_000))).toBe(1);
    const fine = await getPrisma().obligation.findFirstOrThrow({
      where: { groupId, membershipId: late.membershipId, kind: 'FINE' },
    });
    const entry = (await ledgerOf(groupId)).find(
      (t) => t.type === 'FINE_ASSESSED' && t.refId === fine.id,
    )!;
    // The sessions have expired with the clock: everyone logs in again.
    const payer = await loginAgain(late);
    const adminNow = await loginAgain(admin);
    const card = await api(payer).post(`/v1/groups/${groupId}/payments`, {
      obligationIds: [fine.id],
    });
    expect(card.status).toBe(201);
    expect((await confirm(payer, card.body.action.id)).status).toBe(200);

    const refused = await api(adminNow).post(`/v1/groups/${groupId}/proposals`, {
      type: 'LEDGER_CORRECTION',
      seq: entry.seq,
      correction: 'Amende annulée',
      reason: 'Erreur',
    });
    expect(refused.body.code).toBe('LEDGER_ENTRY_NOT_CORRECTABLE');
    const waiver = await api(adminNow).post(`/v1/groups/${groupId}/proposals`, {
      type: 'FINE_WAIVER',
      fineId: fine.id,
      reason: 'Erreur',
    });
    expect(waiver.body.code).toBe('FINE_NOT_WAIVABLE');
    await expectSoundLedger(groupId);
  });

  it('releases the clawback a payout caused when that payout fails (Q1, Q3)', async () => {
    const { groupId, admin, members, everyone } = await realGroup();
    const [payer, recipient, other] = members as [Member, Member, Member];
    const intents: string[] = [];
    for (const member of [admin, payer, recipient, other]) {
      intents.push(await payRoundOne(groupId, member));
    }
    resetTestClock();
    const funds = await fundBalance(admin, groupId);
    expect(funds).toBeGreaterThan(0);

    // The recipient's number is refused by the mock operator: their payout will come back.
    const active = await getPrisma().paymentNumber.findFirstOrThrow({
      where: { userId: recipient.id, activeTo: null },
    });
    await getPrisma().paymentNumber.update({
      where: { id: active.id },
      data: { number: `${active.number.slice(0, -3)}000` },
    });
    try {
      // The whole fund is voted to the recipient and is on its way out.
      const card = await api(admin).post(`/v1/groups/${groupId}/solidarity-requests`, {
        recipientMembershipId: recipient.membershipId,
        event: 'MALADIE',
        amount: funds,
      });
      expect(card.status).toBe(201);
      const opened = await confirm(admin, card.body.action.id);
      const proposalId = String(opened.body.action.result.ref);
      await pass(everyone, proposalId);
      const request = await getPrisma().solidarityRequest.findFirstOrThrow({
        where: { proposalId },
      });
      expect(await fundBalance(admin, groupId)).toBe(0);

      // While it is on its way, the payer's payment is cancelled by a vote: the fund no longer
      // holds what the payer gave it, so the recipient is clawed back (D18.3).
      const payment = (await ledgerOf(groupId)).find(
        (t) => t.type === 'PAYMENT_RECEIVED' && t.refId === intents[1],
      )!;
      const correction = await propose(other, groupId, {
        type: 'LEDGER_CORRECTION',
        seq: payment.seq,
        correction: 'Paiement enregistré par erreur',
        reason: 'Erreur',
      });
      await pass(everyone, correction);
      const clawback = (await ledgerOf(groupId)).find((t) => t.type === 'CLAWBACK')!;
      expect(clawback).toBeDefined();
      const debt = await getPrisma().obligation.findFirstOrThrow({
        where: { groupId, kind: 'CORRECTION', clawbackSeq: clawback.seq },
      });
      expect(debt.status).toBe('DUE');
      expect(debt.membershipId).toBe(clawback.membershipId);

      // The operator refuses the send: the money returns to the fund and the clawback is released.
      advanceTestClock(MOCK_CONFIRMATION_MS + 1_000);
      await pollDisbursement(request.disbursementId!);
      await settleBackground();
      const ledger = await expectSoundLedger(groupId);
      const releases = ledger.filter((t) => t.type === 'CLAWBACK_RELEASE');
      expect(releases.length).toBeGreaterThan(0);
      expect(releases.every((t) => t.metadata.clawbackSeq === clawback.seq)).toBe(true);
      // The debt is cancelled, or replaced by what is still owed: never left as it was.
      const settled = await getPrisma().obligation.findUniqueOrThrow({ where: { id: debt.id } });
      expect(settled.status).not.toBe('DUE');
    } finally {
      await getPrisma().paymentNumber.update({
        where: { id: active.id },
        data: { number: active.number },
      });
    }
  });
});
