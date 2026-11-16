// Rule 8: an operation reaches the operator once. When the operator's answer is lost, nothing is
// sent again by itself; when the operator refuses, the payment fails and the member is told.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { advanceTestClock, resetTestClock } from '../../src/lib/clock';
import { settleBackground } from '../../src/jobs/dispatch';
import { MOCK_CONFIRMATION_MS } from '../../src/modules/providers/mock-provider';
import { getPrisma } from '../../src/lib/prisma';
import { pollPaymentIntent, submitPaymentIntent } from '../../src/modules/payments';
import {
  isSendClaim,
  MockProvider,
  resetPaymentProviderForTests,
  setPaymentProviderForTests,
  type PaymentProvider,
} from '../../src/modules/providers';
import { api, type TestUser } from '../helpers/client';
import { addMember, confirm, createGroup, signUp } from '../helpers/factories';

type Member = TestUser & { membershipId: string };

let groupId: string;
let members: Member[];

/** A provider whose collection request throws `error`; it counts how often it was asked. */
function failingProvider(error: Error): { provider: PaymentProvider; asked: () => number } {
  const real = new MockProvider();
  let count = 0;
  const provider: PaymentProvider = {
    requestPayment: () => {
      count += 1;
      return Promise.reject(error);
    },
    getPaymentStatus: (ref) => real.getPaymentStatus(ref),
    disburse: (input) => real.disburse(input),
    getDisbursementStatus: (ref) => real.getDisbursementStatus(ref),
    getBalance: () => real.getBalance(),
  };
  return { provider, asked: () => count };
}

async function payContribution(member: Member) {
  const obligation = await getPrisma().obligation.findFirstOrThrow({
    where: { groupId, membershipId: member.membershipId, kind: 'CONTRIBUTION', status: 'DUE' },
  });
  const card = await api(member).post(`/v1/groups/${groupId}/payments`, {
    obligationIds: [obligation.id],
  });
  expect(card.status).toBe(201);
  const done = await confirm(member, card.body.action.id);
  expect(done.status).toBe(200);
  return { obligationId: obligation.id, intentId: String(done.body.action.result.ref) };
}

beforeAll(async () => {
  const user = await signUp();
  const created = await createGroup(user);
  groupId = created.groupId;
  const admin = { ...user, membershipId: created.adminMembershipId };
  members = [await addMember(admin, groupId), await addMember(admin, groupId)];
  const card = await api(admin).post(`/v1/groups/${groupId}/cycles/start`);
  expect((await confirm(admin, card.body.action.id)).status).toBe(200);
});

afterEach(() => resetPaymentProviderForTests());

describe('a collection whose answer is lost', () => {
  it('is never asked a second time, stays reserved and is marked for a check', async () => {
    const lost = failingProvider(new Error('socket hang up'));
    setPaymentProviderForTests(lost.provider);
    const { obligationId, intentId } = await payContribution(members[0]!);
    expect(lost.asked()).toBe(1);
    const claimed = await getPrisma().paymentIntent.findUniqueOrThrow({ where: { id: intentId } });
    expect(claimed.status).toBe('CREATED');
    expect(isSendClaim(claimed.providerRef ?? '')).toBe(true);

    // The retry job, a second worker and a later poll: none of them reaches the operator again.
    await submitPaymentIntent(intentId);
    await pollPaymentIntent(intentId);
    await pollPaymentIntent(intentId);
    await settleBackground();
    expect(lost.asked()).toBe(1);
    const after = await getPrisma().paymentIntent.findUniqueOrThrow({ where: { id: intentId } });
    expect(after.status).toBe('EXPIRED');
    // Nothing is booked, and the obligation cannot be paid a second time meanwhile.
    expect(
      (await getPrisma().obligation.findUniqueOrThrow({ where: { id: obligationId } })).status,
    ).toBe('DUE');
    expect(await getPrisma().ledgerTransaction.count({ where: { groupId, refId: intentId } })).toBe(
      0,
    );
    const again = await api(members[0]).post(`/v1/groups/${groupId}/payments`, {
      obligationIds: [obligationId],
    });
    expect(again.body.code).toBe('PAYMENT_ALREADY_PENDING');
  });
});

describe('a collection the operator refuses outright', () => {
  it('fails at once, frees the obligation and tells the member', async () => {
    const refusal = Object.assign(new Error('refused'), { refused: true });
    const refused = failingProvider(refusal);
    setPaymentProviderForTests(refused.provider);
    const { obligationId, intentId } = await payContribution(members[1]!);
    expect(refused.asked()).toBe(1);
    const intent = await getPrisma().paymentIntent.findUniqueOrThrow({ where: { id: intentId } });
    expect(intent.status).toBe('FAILED');
    const action = await getPrisma().pendingAction.findFirstOrThrow({
      where: { resultRef: intentId },
    });
    expect(action.status).toBe('FAILED');
    // The member can try again.
    resetPaymentProviderForTests();
    const retry = await api(members[1]).post(`/v1/groups/${groupId}/payments`, {
      obligationIds: [obligationId],
    });
    expect(retry.status).toBe(201);
  });
});

describe('a correction debt carries its collection fee (D22.2)', () => {
  it('books exactly what the card charged: the debt, and the fee the member added', async () => {
    const member = members[0]!;
    const debt = await getPrisma().obligation.create({
      data: {
        groupId,
        membershipId: member.membershipId,
        kind: 'CORRECTION',
        amount: 5_000,
        dueAt: new Date(),
      },
    });
    const card = await api(member).post(`/v1/groups/${groupId}/payments`, {
      obligationIds: [debt.id],
    });
    expect(card.status).toBe(201);
    const charged = card.body.action.preview.total as number;
    expect(charged).toBeGreaterThan(5_000);
    const done = await confirm(member, card.body.action.id);
    const intentId = String(done.body.action.result.ref);
    advanceTestClock(MOCK_CONFIRMATION_MS + 1_000);
    await pollPaymentIntent(intentId);
    await settleBackground();
    resetTestClock();
    const intent = await getPrisma().paymentIntent.findUniqueOrThrow({ where: { id: intentId } });
    expect(intent).toMatchObject({ status: 'SUCCESSFUL', amount: charged });
    const entry = await getPrisma().ledgerTransaction.findFirstOrThrow({
      where: { groupId, refId: intentId, type: 'PAYMENT_RECEIVED' },
      include: { postings: true },
    });
    const parts = (entry.metadata as { parts: { amount: number; feeCharged?: number }[] }).parts;
    expect(parts[0]).toMatchObject({ amount: charged, feeCharged: charged - 5_000 });
    expect(entry.postings.reduce((sum, p) => sum + p.amount, 0)).toBe(0);
    // The cash recorded is what the operator holds: everything charged, less its fee.
    const cash = entry.postings
      .filter((p) => p.account === 'cash:provider')
      .reduce((s, p) => s + p.amount, 0);
    expect(cash).toBe(charged - intent.fee!);
  });
});
