// What a passed vote does to the money, on the real services, ledger and mock operator: a fine
// waiver (R6.4), a solidarity payout (R10, D18.1), a ledger correction (R11.1, D18.3), a rule
// change that re-dates the rounds (D13.1) and exits mid-cycle (R12.3). After each one the whole
// ledger is checked.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { advanceTestClock, resetTestClock } from '../../src/lib/clock';
import { settleBackground } from '../../src/jobs/dispatch';
import { getPrisma } from '../../src/lib/prisma';
import { assessRoundFines } from '../../src/modules/fines';
import { pollDisbursement } from '../../src/modules/payouts/withdrawals.service';
import { MOCK_CONFIRMATION_MS } from '../../src/modules/providers/mock-provider';
import { payWaitingSolidarity } from '../../src/modules/solidarity/solidarity.money';
import { api } from '../helpers/client';
import { confirm } from '../helpers/factories';
import { propose, proposalOf, type Member } from '../helpers/governance';
import {
  expectSoundLedger,
  fundBalance,
  ledgerOf,
  pass,
  payRoundOne,
  realGroup,
} from '../helpers/money-flows';

const DAY = 86_400_000;

afterEach(() => resetTestClock());

describe('votes that move money in a running cycle', () => {
  let groupId: string;
  let admin: Member;
  let members: Member[];
  let everyone: Member[];
  let rounds: Awaited<ReturnType<typeof realGroup>>['rounds'];
  let adminPayment: string;

  beforeAll(async () => {
    ({ groupId, admin, members, everyone, rounds } = await realGroup());
    // Everyone pays round 1 except the last member, who will be fined.
    adminPayment = await payRoundOne(groupId, admin);
    await payRoundOne(groupId, members[0]!);
    await payRoundOne(groupId, members[1]!);
    resetTestClock();
  });

  it('fines a late member once, and a passed waiver reverses the fine (R6.1, R6.4)', async () => {
    const late = members[2]!;
    const round = rounds[0]!;
    const after = new Date(round.dueAt.getTime() + 60_000);
    expect(await assessRoundFines(round.id, new Date(round.dueAt.getTime() - 60_000))).toBe(0);
    expect(await assessRoundFines(round.id, after)).toBe(1);
    // A second scan fines nobody twice.
    expect(await assessRoundFines(round.id, after)).toBe(0);
    const fine = await getPrisma().obligation.findFirstOrThrow({
      where: { groupId, membershipId: late.membershipId, kind: 'FINE' },
    });
    expect(fine).toMatchObject({ amount: 1_000, status: 'DUE' });
    let ledger = await expectSoundLedger(groupId);
    const assessed = ledger.find((t) => t.type === 'FINE_ASSESSED' && t.refId === fine.id)!;
    expect(assessed.postings.reduce((sum, p) => sum + p.amount, 0)).toBe(0);
    const funds = await api(admin).get(`/v1/groups/${groupId}/funds`);
    expect(funds.body.funds.generalFund).toBe(1_000);

    const id = await propose(admin, groupId, {
      type: 'FINE_WAIVER',
      fineId: fine.id,
      reason: 'Hospitalisé ce jour-là',
    });
    // The fined member does not vote on their own fine.
    expect((await proposalOf(admin, id)).eligibleCount).toBe(3);
    await pass([admin, members[0]!, members[1]!], id);

    expect(
      (await getPrisma().obligation.findUniqueOrThrow({ where: { id: fine.id } })).status,
    ).toBe('CANCELLED');
    ledger = await expectSoundLedger(groupId);
    const reversal = ledger.filter(
      (t) => t.type === 'REVERSAL' && t.metadata.reversesSeq === assessed.seq,
    );
    expect(reversal).toHaveLength(1);
    expect(reversal[0]!.metadata.proposalId).toBe(id);
    expect((await api(admin).get(`/v1/groups/${groupId}/funds`)).body.funds.generalFund).toBe(0);
    // A fine already cancelled cannot be waived again.
    const again = await api(admin).post(`/v1/groups/${groupId}/proposals`, {
      type: 'FINE_WAIVER',
      fineId: fine.id,
      reason: 'Encore',
    });
    expect(again.body.code).toBe('FINE_NOT_WAIVABLE');
  });

  it('pays a voted solidarity request from the fund, once (R10.3, D18.1)', async () => {
    const recipient = members[0]!;
    const before = await fundBalance(admin, groupId);
    expect(before).toBeGreaterThan(2_000);
    // More than the fund holds is refused before any vote.
    const tooMuch = await api(members[1]).post(`/v1/groups/${groupId}/solidarity-requests`, {
      recipientMembershipId: recipient.membershipId,
      event: 'DEUIL',
      amount: before + 1,
    });
    expect(tooMuch.body.code).toBe('SOLIDARITY_ABOVE_FUND');

    const card = await api(members[1]).post(`/v1/groups/${groupId}/solidarity-requests`, {
      recipientMembershipId: recipient.membershipId,
      event: 'DEUIL',
      amount: 2_000,
    });
    expect(card.status).toBe(201);
    const opened = await confirm(members[1]!, card.body.action.id);
    const proposalId = String(opened.body.action.result.ref);
    await pass(everyone, proposalId);

    const request = await getPrisma().solidarityRequest.findFirstOrThrow({ where: { proposalId } });
    expect(request.status).toBe('APPROVED');
    expect(request.disbursementId).not.toBeNull();
    const disbursementId = request.disbursementId!;
    const sent = await getPrisma().disbursement.findUniqueOrThrow({
      where: { id: disbursementId },
    });
    expect(sent.purpose).toBe('SOLIDARITY');
    // The recipient bears the operator's fee: amount sent + estimated fee = the voted amount.
    expect(sent.amount + sent.feeEstimated).toBe(2_000);
    // In flight: out of the fund already, and the scan does not send it a second time.
    expect(await fundBalance(admin, groupId)).toBe(before - 2_000);
    expect(await payWaitingSolidarity()).toBe(0);
    expect(
      await getPrisma().disbursement.count({ where: { groupId, purpose: 'SOLIDARITY' } }),
    ).toBe(1);

    advanceTestClock(MOCK_CONFIRMATION_MS + 1_000);
    await pollDisbursement(disbursementId);
    await pollDisbursement(disbursementId);
    await settleBackground();
    expect(
      (await getPrisma().solidarityRequest.findUniqueOrThrow({ where: { id: request.id } })).status,
    ).toBe('PAID');
    const ledger = await expectSoundLedger(groupId);
    expect(
      ledger.filter((t) => t.type === 'SOLIDARITY_DISBURSED' && t.refId === disbursementId),
    ).toHaveLength(1);
    expect(await fundBalance(admin, groupId)).toBe(before - 2_000);
  });

  it('puts the money back in the fund when the operator refuses the send', async () => {
    const recipient = members[1]!;
    const before = await fundBalance(admin, groupId);
    const active = await getPrisma().paymentNumber.findFirstOrThrow({
      where: { userId: recipient.id, activeTo: null },
    });
    // The mock operator refuses numbers ending in 000.
    await getPrisma().paymentNumber.update({
      where: { id: active.id },
      data: { number: `${active.number.slice(0, -3)}000` },
    });
    try {
      const card = await api(admin).post(`/v1/groups/${groupId}/solidarity-requests`, {
        recipientMembershipId: recipient.membershipId,
        event: 'MALADIE',
        amount: 500,
      });
      expect(card.status).toBe(201);
      const opened = await confirm(admin, card.body.action.id);
      const proposalId = String(opened.body.action.result.ref);
      await pass([admin, members[0]!, members[2]!], proposalId);
      const request = await getPrisma().solidarityRequest.findFirstOrThrow({
        where: { proposalId },
      });
      expect(await fundBalance(admin, groupId)).toBe(before - 500);
      advanceTestClock(MOCK_CONFIRMATION_MS + 1_000);
      await pollDisbursement(request.disbursementId!);
      await settleBackground();
      expect(
        (await getPrisma().solidarityRequest.findUniqueOrThrow({ where: { id: request.id } }))
          .status,
      ).toBe('FAILED');
      expect(await fundBalance(admin, groupId)).toBe(before);
      const ledger = await expectSoundLedger(groupId);
      expect(
        ledger.filter(
          (t) => t.type === 'DISBURSEMENT_RETURNED' && t.refId === request.disbursementId,
        ),
      ).toHaveLength(1);
      // A failed request is not sent again by the scan.
      expect(await payWaitingSolidarity()).toBe(0);
    } finally {
      await getPrisma().paymentNumber.update({
        where: { id: active.id },
        data: { number: active.number },
      });
    }
  });

  it('cancels a payment by a voted correction and leaves every balance sound (R11.1)', async () => {
    let ledger = await ledgerOf(groupId);
    const payment = ledger.find((t) => t.type === 'PAYMENT_RECEIVED' && t.refId === adminPayment)!;
    const paidBefore = await getPrisma().obligation.count({
      where: { groupId, membershipId: admin.membershipId, status: 'PAID' },
    });
    expect(paidBefore).toBeGreaterThan(0);

    const id = await propose(members[0]!, groupId, {
      type: 'LEDGER_CORRECTION',
      seq: payment.seq,
      correction: 'Paiement enregistré par erreur',
      reason: 'Erreur',
    });
    await pass(everyone, id);

    ledger = await expectSoundLedger(groupId);
    const reversal = ledger.filter(
      (t) => t.type === 'REVERSAL' && t.metadata.reversesSeq === payment.seq,
    );
    expect(reversal).toHaveLength(1);
    expect(reversal[0]!.refId).toBe(payment.id);
    // What the payment had paid is due again.
    expect(
      await getPrisma().obligation.count({
        where: { groupId, membershipId: admin.membershipId, status: 'PAID' },
      }),
    ).toBe(0);
    // Each debt a correction left is an obligation of exactly that amount, due now.
    const corrections = ledger.filter(
      (t) => (t.type === 'CLAWBACK' || t.type === 'POT_CORRECTION') && t.refId === payment.id,
    );
    for (const correction of corrections) {
      const owed = correction.postings
        .filter((p) => p.account === `receivable:member:${correction.membershipId}` && p.amount > 0)
        .reduce((sum, p) => sum + p.amount, 0);
      if (owed === 0) continue;
      const debt = await getPrisma().obligation.findFirst({
        where: {
          groupId,
          membershipId: correction.membershipId!,
          kind: 'CORRECTION',
          amount: owed,
        },
      });
      expect(debt?.status).toBe('DUE');
    }
    // The same entry cannot be cancelled twice.
    const again = await api(admin).post(`/v1/groups/${groupId}/proposals`, {
      type: 'LEDGER_CORRECTION',
      seq: payment.seq,
      correction: 'Encore',
      reason: 'Encore',
    });
    expect(again.body.code).toBe('LEDGER_ENTRY_NOT_CORRECTABLE');
    // An entry with no money in it cannot be corrected either.
    const event = ledger.find((t) => t.type === 'EVENT')!;
    const refused = await api(admin).post(`/v1/groups/${groupId}/proposals`, {
      type: 'LEDGER_CORRECTION',
      seq: event.seq,
      correction: 'Tirage',
      reason: 'Tirage',
    });
    expect(refused.body.code).toBe('LEDGER_ENTRY_NOT_CORRECTABLE');
  });

  it('re-dates the rounds not yet opened when the frequency changes (D13.1)', async () => {
    const before = await getPrisma().round.findMany({
      where: { groupId },
      orderBy: { number: 'asc' },
    });
    const id = await propose(members[0]!, groupId, {
      type: 'RULE_CHANGE',
      changes: { frequency: 'WEEKLY' },
      reason: 'Tours plus rapprochés',
    });
    await pass(everyone, id);
    const after = await getPrisma().round.findMany({
      where: { groupId },
      orderBy: { number: 'asc' },
    });
    // The round in progress keeps its dates and its rules.
    expect(after[0]).toMatchObject({
      dueAt: before[0]!.dueAt,
      payoutAt: before[0]!.payoutAt,
      ruleSetVersion: 1,
    });
    // From round 2: one week apart, deadline 24 hours before the payout, at the same time of day.
    expect(after[1]!.payoutAt.getTime() - after[0]!.payoutAt.getTime()).toBe(7 * DAY);
    for (let i = 1; i < after.length; i += 1) {
      expect(after[i]!.ruleSetVersion).toBe(2);
      expect(after[i]!.payoutAt.getTime() - after[i]!.dueAt.getTime()).toBe(DAY);
      if (i > 1) {
        expect(after[i]!.payoutAt.getTime() - after[i - 1]!.payoutAt.getTime()).toBe(7 * DAY);
      }
    }
    const version = await getPrisma().ruleSet.findFirstOrThrow({ where: { groupId, version: 2 } });
    expect(version.effectiveFromRoundId).toBe(after[1]!.id);
    const shown = await proposalOf(admin, id);
    expect(JSON.stringify(shown.effect)).toContain('2');
    await expectSoundLedger(groupId);
  });
});

describe('leaving in the middle of a cycle (R12.3, D13.4)', () => {
  it('refunds a member not yet served and shares what the fund cannot pay', async () => {
    const { groupId, admin, members, everyone } = await realGroup();
    for (const member of everyone) await payRoundOne(groupId, member);
    resetTestClock();
    const cycle = await getPrisma().cycle.findFirstOrThrow({ where: { groupId } });
    // Someone other than the admin whose turn has not come.
    const leaver = members.find((m) => cycle.rotation.indexOf(m.membershipId) > 0)!;
    const contribution = await getPrisma().obligation.findFirstOrThrow({
      where: { groupId, membershipId: leaver.membershipId, kind: 'CONTRIBUTION', status: 'PAID' },
    });

    const id = await propose(leaver, groupId, { type: 'EARLY_EXIT', reason: 'Je déménage' });
    await pass(
      everyone.filter((m) => m.membershipId !== leaver.membershipId),
      id,
    );

    expect(
      (await getPrisma().membership.findUniqueOrThrow({ where: { id: leaver.membershipId } }))
        .status,
    ).toBe('LEFT');
    // Their round is gone and the others moved up.
    const after = await getPrisma().cycle.findUniqueOrThrow({
      where: { id: cycle.id },
      include: { rounds: { orderBy: { number: 'asc' } } },
    });
    expect(after.rotation).toEqual(cycle.rotation.filter((m) => m !== leaver.membershipId));
    expect(after.rounds).toHaveLength(3);
    expect(after.rounds.map((r) => r.beneficiaryMembershipId)).toEqual(after.rotation);
    // The general fund is empty, so the three remaining members share the refund exactly.
    const shares = await getPrisma().obligation.findMany({
      where: { groupId, kind: 'SHORTFALL_SHARE' },
    });
    expect(shares).toHaveLength(3);
    expect(shares.reduce((sum, share) => sum + share.amount, 0)).toBe(contribution.amount);
    expect(shares.every((s) => s.creditorMembershipId === leaver.membershipId)).toBe(true);
    expect(new Set(shares.map((s) => s.membershipId)).has(leaver.membershipId)).toBe(false);
    const ledger = await expectSoundLedger(groupId);
    expect(
      ledger.some(
        (t) =>
          t.type === 'EVENT' &&
          t.metadata.event === 'ROTATION_CHANGED' &&
          t.metadata.proposalId === id,
      ),
    ).toBe(true);
    expect(ledger.some((t) => t.type === 'LEAVER_REFUND')).toBe(false);

    // A member already served keeps owing their contribution to each round still to come.
    const served = everyone.find((m) => m.membershipId === after.rotation[0])!;
    if (served.membershipId !== admin.membershipId) {
      const exit = await propose(served, groupId, { type: 'EARLY_EXIT', reason: 'Je pars' });
      await pass(
        everyone.filter(
          (m) => m.membershipId !== served.membershipId && m.membershipId !== leaver.membershipId,
        ),
        exit,
      );
      const stillOwed = await getPrisma().obligation.findMany({
        where: {
          groupId,
          membershipId: served.membershipId,
          kind: { in: ['CONTRIBUTION', 'SOLIDARITY'] },
          status: 'DUE',
        },
      });
      // Two rounds to come, each with a contribution and the solidarity part (R3.1, R12.3).
      expect(stillOwed.map((o) => o.kind).sort()).toEqual([
        'CONTRIBUTION',
        'CONTRIBUTION',
        'SOLIDARITY',
        'SOLIDARITY',
      ]);
      const stays = await getPrisma().cycle.findUniqueOrThrow({ where: { id: cycle.id } });
      expect(stays.rotation).toContain(served.membershipId);
      await expectSoundLedger(groupId);
    }
  });
});
