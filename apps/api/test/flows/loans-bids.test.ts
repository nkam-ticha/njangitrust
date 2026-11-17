// Loans end to end (R7, D13.4, D18.1) and bidding (R8, D10): on the real services, ledger and mock
// operator. A loan is asked, decided by the admin, sent to the operator once, repaid in
// installments; a bidding round keeps bids private until it closes, then assigns the pot.
import { checkLedger, type LedgerTransaction } from '@njangi/rules';
import { afterEach, describe, expect, it } from 'vitest';
import { advanceTestClock, clock, resetTestClock } from '../../src/lib/clock';
import { settleBackground } from '../../src/jobs/dispatch';
import { closeBidding, closeDueBidding } from '../../src/modules/bids/bids.close';
import { assessRoundFines } from '../../src/modules/fines';
import { getPrisma } from '../../src/lib/prisma';
import { pollPaymentIntent } from '../../src/modules/payments';
import { pollDisbursement } from '../../src/modules/payouts/withdrawals.service';
import { MOCK_CONFIRMATION_MS } from '../../src/modules/providers/mock-provider';
import { readChain } from '../../src/modules/statements/ledger-read';
import { api, type TestUser } from '../helpers/client';
import { addMember, confirm, createGroup, signUp } from '../helpers/factories';

type Member = TestUser & { membershipId: string };

async function startedGroup(rules: Record<string, unknown> = {}) {
  const user = await signUp();
  const created = await createGroup(user, Object.keys(rules).length ? { rules } : {});
  const groupId = created.groupId;
  await getPrisma().group.update({
    where: { id: groupId },
    data: { providerAccount: `test-${groupId}` },
  });
  const admin: Member = { ...user, membershipId: created.adminMembershipId };
  const members = [await addMember(admin, groupId), await addMember(admin, groupId)];
  const card = await api(admin).post(`/v1/groups/${groupId}/cycles/start`);
  expect((await confirm(admin, card.body.action.id)).status).toBe(200);
  const rounds = await getPrisma().round.findMany({
    where: { groupId },
    orderBy: { number: 'asc' },
  });
  return { groupId, admin, members, everyone: [admin, ...members], rounds };
}

/** Pays the listed obligations of a member and lets the operator confirm. */
async function pay(groupId: string, member: Member, obligationIds: string[]): Promise<string> {
  const card = await api(member).post(`/v1/groups/${groupId}/payments`, { obligationIds });
  expect(card.status).toBe(201);
  const done = await confirm(member, card.body.action.id);
  expect(done.status).toBe(200);
  const intentId = String(done.body.action.result.ref);
  advanceTestClock(MOCK_CONFIRMATION_MS + 1_000);
  await pollPaymentIntent(intentId);
  await settleBackground();
  expect(
    (await getPrisma().paymentIntent.findUniqueOrThrow({ where: { id: intentId } })).status,
  ).toBe('SUCCESSFUL');
  return intentId;
}

const dueRoundOne = async (groupId: string, member: Member) =>
  (
    await getPrisma().obligation.findMany({
      where: {
        groupId,
        membershipId: member.membershipId,
        status: 'DUE',
        round: { number: 1 },
      },
    })
  ).map((o) => o.id);

async function soundLedger(groupId: string): Promise<LedgerTransaction[]> {
  const ledger = await readChain(getPrisma(), groupId);
  expect(checkLedger(groupId, ledger)).toEqual([]);
  return ledger;
}

async function login(member: Member): Promise<Member> {
  const res = await api(null, { ownPhones: [member.phone, member.paymentNumber] }).post(
    '/v1/auth/login',
    { phone: member.phone, pin: member.pin },
  );
  expect(res.status).toBe(200);
  return { ...member, accessToken: res.body.session.accessToken as string };
}

afterEach(() => resetTestClock());

describe('a loan from the general fund (R7, D18.1)', () => {
  it('is quoted, asked, decided, sent once, then repaid in installments', async () => {
    const { groupId, admin, members } = await startedGroup();
    const [borrower, late] = members as [Member, Member];
    // The general fund only fills from fines and interest: make the late member's fine large.
    const ruleSet = await getPrisma().ruleSet.findFirstOrThrow({ where: { groupId, version: 1 } });
    await getPrisma().ruleSet.update({
      where: { id: ruleSet.id },
      data: { params: { ...(ruleSet.params as object), lateFine: 5_000 } },
    });
    for (const member of [admin, borrower]) {
      await pay(groupId, member, await dueRoundOne(groupId, member));
    }
    // A member with no money in the fund yet cannot borrow: the limit is the fund's, not theirs.
    const none = await api(borrower).post(`/v1/groups/${groupId}/loans/quote`, {
      amount: 5_000,
      months: 1,
    });
    expect(none.status).toBe(200);
    expect(none.body.quote.ok).toBe(false);

    // The round's deadline passes: the late member is fined, then pays everything.
    const round = await getPrisma().round.findFirstOrThrow({ where: { groupId, number: 1 } });
    advanceTestClock(round.dueAt.getTime() - Date.now() + 60_000);
    expect(await assessRoundFines(round.id, new Date(round.dueAt.getTime() + 60_000))).toBe(1);
    const lateNow = await login(late);
    const lateOwes = await getPrisma().obligation.findMany({
      where: { groupId, membershipId: late.membershipId, status: 'DUE' },
    });
    expect(lateOwes.map((o) => o.kind).sort()).toContain('FINE');
    await pay(
      groupId,
      lateNow,
      lateOwes.map((o) => o.id),
    );
    const borrowerNow = await login(borrower);
    const adminNow = await login(admin);

    const funds = (await api(adminNow).get(`/v1/groups/${groupId}/funds`)).body.funds;
    expect(funds.availableForLoans).toBeGreaterThan(0);

    const asked = { amount: 3_000, months: 2 };
    const quote = await api(borrowerNow).post(`/v1/groups/${groupId}/loans/quote`, asked);
    expect(quote.body.quote.ok).toBe(true);
    // Whole francs only; what is due is the principal, the interest and the operator's fee.
    expect(Number.isSafeInteger(quote.body.quote.interest)).toBe(true);
    expect(quote.body.quote.totalDue).toBe(
      3_000 + quote.body.quote.interest + quote.body.quote.feeEstimate,
    );
    const above = await api(borrowerNow).post(`/v1/groups/${groupId}/loans/quote`, {
      amount: quote.body.quote.limit + 1,
      months: 2,
    });
    expect(above.body.quote.ok).toBe(false);

    const card = await api(borrowerNow).post(`/v1/groups/${groupId}/loans`, asked);
    expect(card.status).toBe(201);
    expect((await confirm(borrowerNow, card.body.action.id)).status).toBe(200);
    const loan = await getPrisma().loan.findFirstOrThrow({
      where: { groupId, membershipId: borrower.membershipId },
    });
    expect(loan.status).toBe('REQUESTED');
    // Rows are stamped by the database's own clock: bring this one to the test clock.
    await getPrisma().loan.update({ where: { id: loan.id }, data: { createdAt: clock.now() } });
    // The borrower cannot decide their own loan; a reason is required.
    const own = await api(borrowerNow).post(`/v1/loans/${loan.id}/decision`, {
      decision: 'approve',
      reason: 'Moi',
    });
    expect(own.status).toBeGreaterThanOrEqual(400);

    const decision = await api(adminNow).post(`/v1/loans/${loan.id}/decision`, {
      decision: 'approve',
      reason: 'Historique de paiement correct',
    });
    expect(decision.status, JSON.stringify(decision.body)).toBe(201);
    expect((await confirm(adminNow, decision.body.action.id)).status).toBe(200);
    const approved = await getPrisma().loan.findUniqueOrThrow({ where: { id: loan.id } });
    expect(approved).toMatchObject({ principal: 3_000, interest: quote.body.quote.interest });
    // Decided once: a second decision is refused.
    const again = await api(adminNow).post(`/v1/loans/${loan.id}/decision`, {
      decision: 'reject',
      reason: 'Encore',
    });
    expect(again.status).toBeGreaterThanOrEqual(400);

    // The send is recorded in the ledger before the operator answers, and happens once.
    await settleBackground();
    const sent = await getPrisma().disbursement.findFirstOrThrow({
      where: { groupId, purpose: 'LOAN' },
    });
    expect(sent.amount).toBe(3_000);
    let ledger = await soundLedger(groupId);
    expect(
      ledger.filter((t) => t.type === 'DISBURSEMENT_SENT' && t.refId === sent.id),
    ).toHaveLength(1);
    advanceTestClock(MOCK_CONFIRMATION_MS + 1_000);
    await pollDisbursement(sent.id);
    await pollDisbursement(sent.id);
    await settleBackground();
    expect((await getPrisma().loan.findUniqueOrThrow({ where: { id: loan.id } })).status).toBe(
      'DISBURSED',
    );
    ledger = await soundLedger(groupId);
    expect(ledger.filter((t) => t.type === 'LOAN_DISBURSED' && t.refId === sent.id)).toHaveLength(
      1,
    );
    expect(await getPrisma().disbursement.count({ where: { groupId, purpose: 'LOAN' } })).toBe(1);

    // Installments: whole amounts adding up to what is due.
    const installments = await getPrisma().obligation.findMany({
      where: { loanId: loan.id, kind: 'LOAN_INSTALLMENT' },
      orderBy: { dueAt: 'asc' },
    });
    expect(installments).toHaveLength(2);
    expect(installments.reduce((sum, i) => sum + i.amount, 0)).toBe(approved.totalDue);
    // A second loan while one runs is refused.
    const second = await api(borrowerNow).post(`/v1/groups/${groupId}/loans/quote`, asked);
    expect(second.body.quote.ok).toBe(false);

    // Repay: the next installment, then the rest; the loan is repaid when none is left.
    for (let i = 0; i < installments.length; i += 1) {
      const repay = await api(borrowerNow).post(`/v1/loans/${loan.id}/repayments`, {});
      expect(repay.status).toBe(201);
      const done = await confirm(borrowerNow, repay.body.action.id);
      expect(done.status).toBe(200);
      const intentId = String(done.body.action.result.ref);
      advanceTestClock(MOCK_CONFIRMATION_MS + 1_000);
      await pollPaymentIntent(intentId);
      await settleBackground();
    }
    expect(await getPrisma().obligation.count({ where: { loanId: loan.id, status: 'DUE' } })).toBe(
      0,
    );
    expect((await getPrisma().loan.findUniqueOrThrow({ where: { id: loan.id } })).status).toBe(
      'REPAID',
    );
    const last = await api(borrowerNow).post(`/v1/loans/${loan.id}/repayments`, {});
    expect(last.status).toBeGreaterThanOrEqual(400);
    await soundLedger(groupId);
  });

  it('records a refusal with its reason and sends nothing', async () => {
    const { groupId, admin, members } = await startedGroup();
    const borrower = members[0]!;
    // A loan row asked directly: the decision flow is what is under test.
    const loan = await getPrisma().loan.create({
      data: {
        groupId,
        membershipId: borrower.membershipId,
        principal: 1_000,
        months: 1,
        ratePermille: 50,
        interest: 50,
        feeEstimated: 0,
        totalDue: 1_050,
        status: 'REQUESTED',
        createdAt: clock.now(),
      },
    });
    const missing = await api(admin).post(`/v1/loans/${loan.id}/decision`, {
      decision: 'reject',
      reason: '   ',
    });
    expect(missing.status).toBe(400);
    const card = await api(admin).post(`/v1/loans/${loan.id}/decision`, {
      decision: 'reject',
      reason: 'La caisse doit rester disponible',
    });
    expect(card.status).toBe(201);
    expect((await confirm(admin, card.body.action.id)).status).toBe(200);
    const after = await getPrisma().loan.findUniqueOrThrow({ where: { id: loan.id } });
    expect(after).toMatchObject({
      status: 'REJECTED',
      decisionReason: 'La caisse doit rester disponible',
    });
    await settleBackground();
    expect(await getPrisma().disbursement.count({ where: { groupId, purpose: 'LOAN' } })).toBe(0);
    // A member who is not the admin cannot decide.
    const other = await getPrisma().loan.create({
      data: {
        groupId,
        membershipId: members[1]!.membershipId,
        principal: 1_000,
        months: 1,
        ratePermille: 50,
        interest: 50,
        feeEstimated: 0,
        totalDue: 1_050,
        status: 'REQUESTED',
      },
    });
    const denied = await api(members[0]).post(`/v1/loans/${other.id}/decision`, {
      decision: 'approve',
      reason: 'Je veux',
    });
    expect(denied.status).toBeGreaterThanOrEqual(400);
    await soundLedger(groupId);
  });
});

describe('a bidding round (R8, D10)', () => {
  it('keeps bids private, then assigns the pot to the highest bid at the close', async () => {
    const { groupId, admin, members, everyone, rounds } = await startedGroup({
      rotationMode: 'BIDDING',
    });
    const [first] = rounds as [(typeof rounds)[number]];
    expect(first.beneficiaryMembershipId).toBeNull();
    for (const member of everyone) {
      await pay(groupId, member, await dueRoundOne(groupId, member));
    }
    // The contributions wait in the round's pot: nobody owns them yet.
    let ledger = await soundLedger(groupId);
    expect(ledger.some((t) => t.type === 'POT_ASSIGNED')).toBe(false);

    const bid = async (member: Member, amount: number) => {
      const card = await api(member).post(`/v1/groups/${groupId}/rounds/${first.id}/bids`, {
        amount,
      });
      if (card.status !== 201) return card;
      return confirm(member, card.body.action.id);
    };
    expect((await bid(admin, 1_000)).status).toBe(200);
    expect((await bid(members[0]!, 2_500)).status).toBe(200);
    expect((await bid(members[1]!, 1_500)).status).toBe(200);
    // Below the minimum bid, or lower than one's own bid, is refused.
    expect((await bid(admin, 100)).status).toBeGreaterThanOrEqual(400);
    expect((await bid(members[0]!, 2_000)).status).toBeGreaterThanOrEqual(400);
    // A bid can be raised.
    expect((await bid(members[1]!, 2_000)).status).toBe(200);

    // Before the close nobody sees another member's bid: only their own, and how many there are.
    const hidden = await api(admin).get(`/v1/groups/${groupId}/rounds/${first.id}/bids`);
    expect(hidden.body.bids).toBeNull();
    expect(hidden.body.count).toBe(3);
    expect(hidden.body.mine.amount).toBe(1_000);
    expect(JSON.stringify(hidden.body)).not.toContain('2500');
    expect(await closeBidding(first.id)).toBe(false);

    // The deadline passes: the highest bid wins, the pot goes to the winner, the bid is owed.
    const now = new Date(first.dueAt.getTime() + 60_000);
    expect(await closeDueBidding(now)).toBeGreaterThanOrEqual(1);
    expect(await closeBidding(first.id, now)).toBe(false);
    const closed = await getPrisma().round.findUniqueOrThrow({ where: { id: first.id } });
    expect(closed.beneficiaryMembershipId).toBe(members[0]!.membershipId);
    const debt = await getPrisma().obligation.findFirstOrThrow({
      where: { groupId, roundId: first.id, kind: 'BID' },
    });
    expect(debt).toMatchObject({
      membershipId: members[0]!.membershipId,
      amount: 2_500,
      status: 'DUE',
    });
    expect(debt.dueAt.getTime()).toBe(first.payoutAt.getTime());
    ledger = await soundLedger(groupId);
    const published = ledger.find(
      (t) => t.type === 'EVENT' && t.metadata.event === 'BIDS_PUBLISHED',
    )!;
    expect(published.metadata.beneficiaryMembershipId).toBe(members[0]!.membershipId);
    expect(ledger.filter((t) => t.type === 'BID_ASSESSED')).toHaveLength(1);
    const assigned = ledger.filter((t) => t.type === 'POT_ASSIGNED' && t.roundId === first.id);
    expect(assigned).toHaveLength(1);
    // The pot holds every contribution, less the fees that went with them.
    expect(assigned[0]!.postings.reduce((sum, p) => sum + p.amount, 0)).toBe(0);

    // After the close everything is published, and no new bid is accepted.
    const shown = await api(admin).get(`/v1/groups/${groupId}/rounds/${first.id}/bids`);
    expect(shown.body.bids).toBeNull();
    advanceTestClock(first.dueAt.getTime() - Date.now() + 120_000);
    const adminNow = await login(admin);
    const open = await api(adminNow).get(`/v1/groups/${groupId}/rounds/${first.id}/bids`);
    expect(open.body.winnerMembershipId).toBe(members[0]!.membershipId);
    expect(open.body.bids.map((b: { amount: number }) => b.amount)).toEqual([2_500, 2_000, 1_000]);
    const late = await api(adminNow).post(`/v1/groups/${groupId}/rounds/${first.id}/bids`, {
      amount: 5_000,
    });
    expect(late.status).toBeGreaterThanOrEqual(400);
  });
});
