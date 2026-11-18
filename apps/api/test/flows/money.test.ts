// The money path end to end on the real services, ledger and mock provider (spec 2.5 to 2.7):
// start a cycle, pay contributions, open the payout, withdraw. Every step is checked in the ledger.
import { checkLedger, type LedgerTransaction } from '@njangi/rules';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { advanceTestClock, resetTestClock } from '../../src/lib/clock';
import { settleBackground } from '../../src/jobs/dispatch';
import { getPrisma } from '../../src/lib/prisma';
import { pollPaymentIntent } from '../../src/modules/payments/payments.service';
import { openPayout } from '../../src/modules/payouts/payouts.service';
import {
  pollDisbursement,
  recordDisbursementRefund,
} from '../../src/modules/payouts/withdrawals.service';
import { MOCK_CONFIRMATION_MS } from '../../src/modules/providers/mock-provider';
import { runDailyReconciliation } from '../../src/modules/reconciliation/reconciliation.service';
import { api, type TestUser } from '../helpers/client';
import { addMember, confirm, createGroup, signUp } from '../helpers/factories';

type Member = TestUser & { membershipId: string };

/** The group's contribution (default rule set), read from round 1's obligations. */
let CONTRIBUTION = 0;

let groupId: string;
let providerAccount: string;
let admin: Member;
let members: Member[];
let everyone: Member[];
let roundId: string;
let beneficiary: Member;

async function ledgerOf(id: string): Promise<LedgerTransaction[]> {
  const rows = await getPrisma().ledgerTransaction.findMany({
    where: { groupId: id },
    include: { postings: true },
    orderBy: { seq: 'asc' },
  });
  return rows.map((row) => ({
    id: row.id,
    groupId: row.groupId,
    seq: row.seq,
    type: row.type,
    occurredAt: row.occurredAt.toISOString(),
    roundId: row.roundId,
    membershipId: row.membershipId,
    refType: row.refType,
    refId: row.refId,
    descriptionFr: row.descriptionFr,
    descriptionEn: row.descriptionEn,
    metadata: row.metadata as LedgerTransaction['metadata'],
    postings: row.postings.map((p) => ({ account: p.account, amount: p.amount })),
    prevHash: row.prevHash,
    hash: row.hash,
  }));
}

const contributionOf = (member: Member) =>
  getPrisma().obligation.findFirstOrThrow({
    where: { roundId, membershipId: member.membershipId, kind: 'CONTRIBUTION' },
  });

/** Asks to pay, confirms, and returns the payment intent id. */
async function startPayment(member: Member, obligationIds: string[]): Promise<string> {
  const card = await api(member).post(`/v1/groups/${groupId}/payments`, { obligationIds });
  expect(card.status).toBe(201);
  const done = await confirm(member, card.body.action.id);
  expect(done.status).toBe(200);
  expect(done.body.action.status).toBe('CONFIRMED');
  return String(done.body.action.result.ref);
}

/** The operator confirms after a few seconds: move the clock, then run the status check. */
async function providerAnswers(check: () => Promise<void>): Promise<void> {
  advanceTestClock(MOCK_CONFIRMATION_MS + 1_000);
  await check();
  await settleBackground();
}

async function loginAgain(member: Member): Promise<Member> {
  const res = await api(null, { ownPhones: [member.phone, member.paymentNumber] }).post(
    '/v1/auth/login',
    { phone: member.phone, pin: member.pin },
  );
  expect(res.status).toBe(200);
  return { ...member, accessToken: res.body.session.accessToken as string };
}

beforeAll(async () => {
  const user = await signUp();
  const created = await createGroup(user);
  groupId = created.groupId;
  // Its own provider account: the daily check then covers this group's money only, not the
  // ledgers other test files seed in the shared database.
  providerAccount = `test-${groupId}`;
  await getPrisma().group.update({ where: { id: groupId }, data: { providerAccount } });
  admin = { ...user, membershipId: created.adminMembershipId };
  members = [await addMember(admin, groupId), await addMember(admin, groupId)];
  everyone = [admin, ...members];
  const card = await api(admin).post(`/v1/groups/${groupId}/cycles/start`);
  expect((await confirm(admin, card.body.action.id)).status).toBe(200);
});

afterEach(() => resetTestClock());

describe('starting the cycle (R1.1, R2.3)', () => {
  it('creates the rounds, the draw event and round 1 obligations', async () => {
    const group = await getPrisma().group.findUniqueOrThrow({ where: { id: groupId } });
    expect(group.status).toBe('ACTIVE');
    const rounds = await getPrisma().round.findMany({
      where: { cycleId: group.currentCycleId! },
      orderBy: { number: 'asc' },
    });
    expect(rounds).toHaveLength(3);
    expect(rounds.map((r) => r.status)).toEqual(['OPEN', 'SCHEDULED', 'SCHEDULED']);
    // Everyone receives exactly once.
    expect(new Set(rounds.map((r) => r.beneficiaryMembershipId))).toEqual(
      new Set(everyone.map((m) => m.membershipId)),
    );
    roundId = rounds[0]!.id;
    beneficiary = everyone.find((m) => m.membershipId === rounds[0]!.beneficiaryMembershipId)!;
    const contributions = await getPrisma().obligation.findMany({
      where: { roundId, kind: 'CONTRIBUTION' },
    });
    expect(contributions).toHaveLength(3);
    CONTRIBUTION = contributions[0]!.amount;
    expect(CONTRIBUTION).toBeGreaterThan(0);
    expect(contributions.every((o) => o.amount === CONTRIBUTION && o.status === 'DUE')).toBe(true);
    const ledger = await ledgerOf(groupId);
    expect(ledger.some((t) => t.type === 'EVENT' && t.metadata.event === 'CYCLE_STARTED')).toBe(
      true,
    );
    expect(checkLedger(groupId, ledger)).toEqual([]);
    const shown = await api(members[0]).get(`/v1/groups/${groupId}/rounds/current`);
    expect(shown.status).toBe(200);
    expect(shown.body.round).toMatchObject({ number: 1, status: 'OPEN', paidCount: 0 });
  });
});

describe('paying a contribution (R3, R4, spec 2.6)', () => {
  it('shows the exact card and refuses someone else’s obligation', async () => {
    const mine = await contributionOf(members[0]!);
    const card = await api(members[0]).post(`/v1/groups/${groupId}/payments`, {
      obligationIds: [mine.id],
    });
    expect(card.status).toBe(201);
    expect(card.body.action.preview.total).toBeGreaterThanOrEqual(CONTRIBUTION);
    const theirs = await contributionOf(members[1]!);
    const refused = await api(members[0]).post(`/v1/groups/${groupId}/payments`, {
      obligationIds: [theirs.id],
    });
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(refused.body.code).toBe('OBLIGATION_NOT_AVAILABLE');
  });

  it('settles only after the operator confirms, once, in a balanced ledger entry', async () => {
    const member = members[0]!;
    const obligation = await contributionOf(member);
    const intentId = await startPayment(member, [obligation.id]);
    // Asked, not confirmed: nothing is paid yet and the same obligation cannot be paid twice.
    expect((await contributionOf(member)).status).toBe('DUE');
    const again = await api(member).post(`/v1/groups/${groupId}/payments`, {
      obligationIds: [obligation.id],
    });
    expect(again.body.code).toBe('PAYMENT_ALREADY_PENDING');
    await pollPaymentIntent(intentId);
    expect((await contributionOf(member)).status).toBe('DUE');

    await providerAnswers(() => pollPaymentIntent(intentId));
    const paid = await contributionOf(member);
    expect(paid.status).toBe('PAID');
    expect(paid.onTime).toBe(true);
    const intent = await getPrisma().paymentIntent.findUniqueOrThrow({ where: { id: intentId } });
    expect(intent.status).toBe('SUCCESSFUL');
    // A second confirmation from the operator changes nothing (idempotent settlement).
    await pollPaymentIntent(intentId);
    const ledger = await ledgerOf(groupId);
    const entries = ledger.filter((t) => t.type === 'PAYMENT_RECEIVED' && t.refId === intentId);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.postings.reduce((sum, p) => sum + p.amount, 0)).toBe(0);
    expect(checkLedger(groupId, ledger)).toEqual([]);
    const shown = await api(member).get(`/v1/payments/${intentId}`);
    expect(shown.body.payment).toMatchObject({ status: 'SUCCESSFUL', amount: intent.amount });
    const action = await getPrisma().pendingAction.findFirstOrThrow({
      where: { resultRef: intentId },
    });
    expect(action.status).toBe('DONE');
    // Another member cannot read this payment.
    expect((await api(members[1]).get(`/v1/payments/${intentId}`)).status).toBe(404);
  });

  it('leaves the obligation due when the operator refuses', async () => {
    const member = members[1]!;
    const obligation = await contributionOf(member);
    const active = await getPrisma().paymentNumber.findFirstOrThrow({
      where: { userId: member.id, activeTo: null },
    });
    // The mock operator refuses numbers ending in 000.
    await getPrisma().paymentNumber.update({
      where: { id: active.id },
      data: { number: `${active.number.slice(0, -3)}000` },
    });
    const refusedPhone = `${active.number.slice(0, -3)}000`;
    const asRefused = { ...member, paymentNumber: refusedPhone };
    const intentId = await startPayment(asRefused, [obligation.id]);
    await providerAnswers(() => pollPaymentIntent(intentId));
    expect(
      (await getPrisma().paymentIntent.findUniqueOrThrow({ where: { id: intentId } })).status,
    ).toBe('FAILED');
    expect((await contributionOf(member)).status).toBe('DUE');
    const action = await getPrisma().pendingAction.findFirstOrThrow({
      where: { resultRef: intentId },
    });
    expect(action.status).toBe('FAILED');
    await getPrisma().paymentNumber.update({
      where: { id: active.id },
      data: { number: active.number },
    });
    // With the working number the same obligation can be paid.
    const retry = await startPayment(member, [obligation.id]);
    await providerAnswers(() => pollPaymentIntent(retry));
    expect((await contributionOf(member)).status).toBe('PAID');
  });
});

describe('payout and withdrawal (R5, D18.1)', () => {
  it('keeps the pot locked until payout time, then pays it out once', async () => {
    const obligation = await contributionOf(admin);
    const intentId = await startPayment(admin, [obligation.id]);
    await providerAnswers(() => pollPaymentIntent(intentId));
    expect((await contributionOf(admin)).status).toBe('PAID');
    expect((await runDailyReconciliation(providerAccount)).status).not.toBe('ALERT');

    // Before payout time the money is locked.
    const early = await api(beneficiary).post(`/v1/groups/${groupId}/withdrawals`, {
      amount: 'ALL',
    });
    expect(early.status).toBeGreaterThanOrEqual(400);
    expect(early.body.code).toBe('NOTHING_TO_WITHDRAW');
    const round = await getPrisma().round.findUniqueOrThrow({ where: { id: roundId } });
    expect(await openPayout(roundId)).toBe(false);

    // Payout time.
    advanceTestClock(round.payoutAt.getTime() - Date.now() + 60_000);
    const payoutNow = new Date(round.payoutAt.getTime() + 60_000);
    expect(await openPayout(roundId, payoutNow)).toBe(true);
    expect(await openPayout(roundId, payoutNow)).toBe(false);
    // Two months later the sessions have expired: everyone logs in again.
    beneficiary = await loginAgain(beneficiary);

    // Another member has nothing to withdraw.
    const other = await loginAgain(
      everyone.find((m) => m.membershipId !== beneficiary.membershipId)!,
    );
    const none = await api(other).post(`/v1/groups/${groupId}/withdrawals`, { amount: 'ALL' });
    expect(none.body.code).toBe('NOTHING_TO_WITHDRAW');

    const card = await api(beneficiary).post(`/v1/groups/${groupId}/withdrawals`, {
      amount: 'ALL',
    });
    expect(card.status).toBe(201);
    const amount = card.body.action.preview.lines[0].amount as number;
    expect(amount).toBeGreaterThan(0);
    expect(amount).toBeLessThanOrEqual(3 * CONTRIBUTION);
    const done = await confirm(beneficiary, card.body.action.id);
    expect(done.status).toBe(200);
    const disbursementId = String(done.body.action.result.ref);

    // In flight: recorded in the ledger before the operator answers, and no second withdrawal.
    let ledger = await ledgerOf(groupId);
    expect(
      ledger.filter((t) => t.type === 'DISBURSEMENT_SENT' && t.refId === disbursementId),
    ).toHaveLength(1);
    const second = await api(beneficiary).post(`/v1/groups/${groupId}/withdrawals`, {
      amount: 'ALL',
    });
    expect(second.status).toBeGreaterThanOrEqual(400);

    advanceTestClock(MOCK_CONFIRMATION_MS + 1_000);
    await pollDisbursement(disbursementId);
    await pollDisbursement(disbursementId);
    await settleBackground();
    const row = await getPrisma().disbursement.findUniqueOrThrow({ where: { id: disbursementId } });
    expect(row.status).toBe('SUCCESSFUL');
    expect(row.amount).toBe(amount);
    ledger = await ledgerOf(groupId);
    expect(
      ledger.filter((t) => t.type === 'WITHDRAWAL_COMPLETED' && t.refId === disbursementId),
    ).toHaveLength(1);
    expect(checkLedger(groupId, ledger)).toEqual([]);
    const shown = await api(beneficiary).get(`/v1/withdrawals/${disbursementId}`);
    expect(shown.body.withdrawal).toMatchObject({ status: 'SUCCESSFUL', amount });
    expect(
      (await api(other).get(`/v1/withdrawals/${disbursementId}`)).status,
    ).toBeGreaterThanOrEqual(400);
    // The books still match the operator after the money left.
    expect((await runDailyReconciliation(providerAccount)).status).not.toBe('ALERT');

    // A separately confirmed operator reversal is recorded once, and the member's payable is
    // restored according to D22.1. Repeating the trusted callback cannot double-credit it.
    const refund = await recordDisbursementRefund({
      disbursementId,
      feeKept: 0,
      reason: 'Provider confirmed reversal',
    });
    expect(refund).toEqual({ alreadyRecorded: false });
    expect(
      await recordDisbursementRefund({
        disbursementId,
        feeKept: 0,
        reason: 'Repeated provider reversal callback',
      }),
    ).toEqual({ alreadyRecorded: true });
    expect(
      (await getPrisma().disbursement.findUniqueOrThrow({ where: { id: disbursementId } })).status,
    ).toBe('REFUNDED');
    ledger = await ledgerOf(groupId);
    expect(
      ledger.filter((t) => t.type === 'DISBURSEMENT_REFUNDED' && t.refId === disbursementId),
    ).toHaveLength(1);
    expect(checkLedger(groupId, ledger)).toEqual([]);
  });
});
