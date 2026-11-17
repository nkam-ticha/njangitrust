// The daily caisse check (spec 2.9, R5.5): what a member can read about it, and the ALERT path:
// when the operator's balance cannot be read or does not match the records, withdrawals stop and
// every member is told once.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { advanceTestClock, resetTestClock } from '../../src/lib/clock';
import { settleBackground } from '../../src/jobs/dispatch';
import { repeatableJobs } from '../../src/jobs/registry';
import { getPrisma } from '../../src/lib/prisma';
import { pollPaymentIntent } from '../../src/modules/payments';
import { MOCK_CONFIRMATION_MS } from '../../src/modules/providers/mock-provider';
import {
  MockProvider,
  resetPaymentProviderForTests,
  setPaymentProviderForTests,
  type PaymentProvider,
} from '../../src/modules/providers';
import { runDailyReconciliation } from '../../src/modules/reconciliation';
import { registerJobs } from '../../src/modules/register';
import { api, type TestUser } from '../helpers/client';
import { addMember, confirm, createGroup, signUp } from '../helpers/factories';

type Member = TestUser & { membershipId: string };

let groupId: string;
let providerAccount: string;
let admin: Member;
let member: Member;

/** The mock operator, except for the balance it reports. */
function providerWithBalance(getBalance: PaymentProvider['getBalance']): PaymentProvider {
  const real = new MockProvider();
  return {
    requestPayment: (input) => real.requestPayment(input),
    getPaymentStatus: (ref) => real.getPaymentStatus(ref),
    disburse: (input) => real.disburse(input),
    getDisbursementStatus: (ref) => real.getDisbursementStatus(ref),
    getBalance,
  };
}

const checkNotices = (userId: string) =>
  getPrisma().notification.count({ where: { userId, groupId, deepLink: '/caisse' } });

beforeAll(async () => {
  const user = await signUp();
  const created = await createGroup(user);
  groupId = created.groupId;
  // Its own provider account, so the check covers this group only.
  providerAccount = `test-${groupId}`;
  await getPrisma().group.update({ where: { id: groupId }, data: { providerAccount } });
  admin = { ...user, membershipId: created.adminMembershipId };
  member = await addMember(admin, groupId);
  await addMember(admin, groupId);
  const card = await api(admin).post(`/v1/groups/${groupId}/cycles/start`);
  expect((await confirm(admin, card.body.action.id)).status).toBe(200);
});

afterEach(() => {
  resetPaymentProviderForTests();
  resetTestClock();
});

describe('the daily check job', () => {
  it('is registered with the other jobs, every day at 6:00', () => {
    registerJobs();
    expect(repeatableJobs().map((job) => job.name)).toContain('reconciliation.daily');
  });
});

describe('reading the last check (GET /groups/:id/reconciliation/latest)', () => {
  it('answers null before the first check and refuses a stranger', async () => {
    const res = await api(member).get(`/v1/groups/${groupId}/reconciliation/latest`);
    expect(res.status).toBe(200);
    expect(res.body.reconciliation).toBeNull();
    const stranger = await signUp();
    const refused = await api(stranger).get(`/v1/groups/${groupId}/reconciliation/latest`);
    expect(refused.status).toBeGreaterThanOrEqual(400);
  });

  it('shows the result with no balance, account or amount', async () => {
    const run = await runDailyReconciliation(providerAccount);
    expect(run.status).toBe('OK');
    const res = await api(member).get(`/v1/groups/${groupId}/reconciliation/latest`);
    expect(res.status).toBe(200);
    expect(res.body.reconciliation).toEqual({
      ranAt: run.ranAt.toISOString(),
      status: 'OK',
      withdrawalsPaused: false,
      reason: null,
    });
  });
});

describe('the ALERT path (R5.5, D16.2)', () => {
  it('pauses withdrawals and tells every member once when the balance cannot be read', async () => {
    setPaymentProviderForTests(
      providerWithBalance(() => Promise.reject(new Error('operator unreachable'))),
    );
    const before = await checkNotices(member.id);
    const run = await runDailyReconciliation(providerAccount);
    await settleBackground();
    expect(run.status).toBe('ALERT');
    expect(await checkNotices(member.id)).toBe(before + 1);
    expect(await checkNotices(admin.id)).toBeGreaterThan(0);

    const shown = await api(member).get(`/v1/groups/${groupId}/reconciliation/latest`);
    expect(shown.body.reconciliation).toMatchObject({
      status: 'ALERT',
      withdrawalsPaused: true,
      reason: 'PROVIDER_UNAVAILABLE',
    });
    const money = await api(member).get(`/v1/groups/${groupId}/me/money`);
    expect(money.body.money.withdrawalsPaused).toBe(true);
    const refused = await api(member).post(`/v1/groups/${groupId}/withdrawals`, { amount: 'ALL' });
    expect(refused.status).toBeGreaterThanOrEqual(400);

    // A second ALERT in a row does not notify again.
    await runDailyReconciliation(providerAccount);
    await settleBackground();
    expect(await checkNotices(member.id)).toBe(before + 1);
  });

  it('raises an ALERT when the operator holds less than the records say', async () => {
    // A real contribution, confirmed by the operator: the records now hold cash.
    const obligation = await getPrisma().obligation.findFirstOrThrow({
      where: { groupId, membershipId: member.membershipId, kind: 'CONTRIBUTION', status: 'DUE' },
    });
    const card = await api(member).post(`/v1/groups/${groupId}/payments`, {
      obligationIds: [obligation.id],
    });
    expect(card.status).toBe(201);
    const done = await confirm(member, card.body.action.id);
    const intentId = String(done.body.action.result.ref);
    advanceTestClock(MOCK_CONFIRMATION_MS + 1_000);
    await pollPaymentIntent(intentId);
    await settleBackground();
    const intent = await getPrisma().paymentIntent.findUniqueOrThrow({ where: { id: intentId } });
    expect(intent.status).toBe('SUCCESSFUL');
    const held = intent.amount - (intent.fee ?? 0);
    expect((await runDailyReconciliation(providerAccount)).status).toBe('OK');

    const before = await checkNotices(member.id);
    setPaymentProviderForTests(providerWithBalance(() => Promise.resolve({ total: 0 })));
    const run = await runDailyReconciliation(providerAccount);
    await settleBackground();
    expect(run.status).toBe('ALERT');
    expect(run.difference).not.toBe(0);
    expect(await checkNotices(member.id)).toBe(before + 1);
    const shown = await api(member).get(`/v1/groups/${groupId}/reconciliation/latest`);
    expect(shown.body.reconciliation.withdrawalsPaused).toBe(true);
    expect(shown.body.reconciliation.reason).not.toBeNull();

    // Once the operator's balance matches again the pause ends.
    setPaymentProviderForTests(providerWithBalance(() => Promise.resolve({ total: held })));
    expect((await runDailyReconciliation(providerAccount)).status).not.toBe('ALERT');
    const after = await api(member).get(`/v1/groups/${groupId}/reconciliation/latest`);
    expect(after.body.reconciliation.withdrawalsPaused).toBe(false);
  });
});
