// The member's own account: changing the payment number (R13, NUM-01/02) and deleting the account
// (PRV-03). Both are level 2: the member's own PIN confirms them; nobody else can do either.
import { describe, expect, it } from 'vitest';
import { getPrisma } from '../../src/lib/prisma';
import { accountAdapter } from '../../src/agent/adapters/account';
import { api } from '../helpers/client';
import {
  TEST_PIN,
  addMember,
  confirm,
  createGroup,
  freshPhone,
  signUp,
} from '../helpers/factories';

const activeNumbers = (userId: string) =>
  getPrisma().paymentNumber.findMany({ where: { userId }, orderBy: { activeFrom: 'asc' } });

describe('changing my payment number (R13)', () => {
  it('needs the member’s PIN, keeps the history and tells the group without digits', async () => {
    const admin = await signUp();
    const { groupId } = await createGroup(admin);
    const member = await addMember(admin, groupId);
    const before = await activeNumbers(member.id);
    expect(before).toHaveLength(1);
    const next = await freshPhone();

    const card = await api(member).post('/v1/me/payment-number', { number: next });
    expect(card.status).toBe(201);
    expect(card.body.action).toMatchObject({ type: 'CHANGE_PAYMENT_NUMBER', requiresPin: true });
    // The card shows the number masked, never in full.
    expect(JSON.stringify(card.body.action.preview)).not.toContain(next.slice(-8));
    // The number is sealed while the card is pending.
    const stored = await getPrisma().pendingAction.findUniqueOrThrow({
      where: { id: card.body.action.id },
    });
    expect(JSON.stringify(stored.args)).not.toContain(next);

    // No PIN, or somebody else's PIN: refused, nothing changes.
    expect((await confirm(member, card.body.action.id)).status).toBeGreaterThanOrEqual(400);
    expect((await confirm(member, card.body.action.id, '135790')).status).toBeGreaterThanOrEqual(
      400,
    );
    expect(await activeNumbers(member.id)).toHaveLength(1);

    const done = await confirm(member, card.body.action.id, TEST_PIN);
    expect(done.status).toBe(200);
    const numbers = await activeNumbers(member.id);
    expect(numbers).toHaveLength(2);
    expect(numbers[0]!.activeTo).not.toBeNull();
    expect(numbers[1]).toMatchObject({ number: next, activeTo: null });
    // Once finished, the stored card keeps no number.
    const finished = await getPrisma().pendingAction.findUniqueOrThrow({
      where: { id: card.body.action.id },
    });
    expect(JSON.stringify(finished.args)).not.toContain(next);
    expect(JSON.stringify(finished.preview)).not.toContain(next);

    // R13.4: a fact in the group's records and a message in the chat, with no digits.
    const ledger = await getPrisma().ledgerTransaction.findMany({ where: { groupId } });
    expect(
      ledger.some(
        (t) =>
          t.type === 'EVENT' &&
          (t.metadata as { event?: string }).event === 'PAYMENT_NUMBER_CHANGED',
      ),
    ).toBe(true);
    const messages = await getPrisma().message.findMany({ where: { groupId } });
    const system = messages.filter((m) => /numéro de paiement/.test(JSON.stringify(m)));
    expect(system.length).toBeGreaterThan(0);
    expect(JSON.stringify(system)).not.toMatch(/\d{6}/);
    // The member and the admin are told.
    const notices = await getPrisma().notification.findMany({
      where: { userId: { in: [member.id, admin.id] }, category: 'SECURITY' },
    });
    expect(notices.some((n) => n.userId === member.id)).toBe(true);
    expect(notices.some((n) => n.userId === admin.id)).toBe(true);
    expect(JSON.stringify(notices)).not.toContain(next);
  });

  it('refuses a number that is not valid, or that is already the current one', async () => {
    const user = await signUp();
    const bad = await api(user).post('/v1/me/payment-number', { number: '123456789' });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('NUMBER_NOT_VALID');
    const same = await api(user).post('/v1/me/payment-number', { number: user.paymentNumber });
    expect(same.body.code).toBe('NUMBER_UNCHANGED');
    // Nobody can change someone else's number: the route takes no member, only the caller.
    const other = await signUp();
    const own = await api(other).post('/v1/me/payment-number', {
      number: await freshPhone(),
      membershipId: user.id,
    });
    expect(own.status).toBe(400);
  });

  it('is prepared by the agent as a PIN-confirmed card for the member it talks to', async () => {
    const user = await signUp();
    const card = await accountAdapter.prepareChangePaymentNumber(
      { userId: user.id, lang: 'fr' } as never,
      { number: await freshPhone() },
    );
    expect(card).toMatchObject({ type: 'CHANGE_PAYMENT_NUMBER', origin: 'AGENT', level: 'L2' });
    expect(await activeNumbers(user.id)).toHaveLength(1);
  });
});

describe('deleting my account (PRV-03)', () => {
  it('refuses while the member is an admin, or inside a running cycle', async () => {
    const admin = await signUp();
    const { groupId } = await createGroup(admin);
    const adminCard = await api(admin).post('/v1/me/account-deletion');
    expect(adminCard.body.code).toBe('DELETE_IS_ADMIN');

    const members = [await addMember(admin, groupId), await addMember(admin, groupId)];
    const start = await api(admin).post(`/v1/groups/${groupId}/cycles/start`);
    expect((await confirm(admin, start.body.action.id)).status).toBe(200);
    const running = await api(members[0]).post('/v1/me/account-deletion');
    expect(running.body.code).toBe('DELETE_IN_RUNNING_CYCLE');
  });

  it('anonymises the member, closes every login and keeps the group’s records', async () => {
    const admin = await signUp();
    const { groupId } = await createGroup(admin);
    const member = await addMember(admin, groupId);
    const user = await getPrisma().user.findUniqueOrThrow({ where: { id: member.id } });

    const card = await api(member).post('/v1/me/account-deletion');
    expect(card.status).toBe(201);
    expect(card.body.action).toMatchObject({ type: 'DELETE_ACCOUNT', requiresPin: true });
    expect((await confirm(member, card.body.action.id)).status).toBeGreaterThanOrEqual(400);
    expect((await getPrisma().user.findUniqueOrThrow({ where: { id: member.id } })).deletedAt).toBe(
      null,
    );
    expect((await confirm(member, card.body.action.id, TEST_PIN)).status).toBe(200);

    const after = await getPrisma().user.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.deletedAt).not.toBeNull();
    expect(after.name).not.toBe(user.name);
    expect(after.loginPhone).not.toBe(user.loginPhone);
    expect(after.loginPhone.startsWith('deleted:')).toBe(true);
    expect((await activeNumbers(member.id)).every((n) => n.number === '+237600000000')).toBe(true);
    expect(await getPrisma().refreshToken.count({ where: { userId: member.id } })).toBe(0);
    expect(await getPrisma().notification.count({ where: { userId: member.id } })).toBe(0);
    // The membership stays as a record, now closed; the group keeps its chat history.
    const membership = await getPrisma().membership.findUniqueOrThrow({
      where: { id: member.membershipId },
    });
    expect(membership.status).toBe('LEFT');
    expect(await getPrisma().message.count({ where: { groupId } })).toBeGreaterThan(0);

    // The old token and the old number no longer open anything.
    expect((await api(member).get('/v1/me')).status).toBe(401);
    const login = await api(null, { ownPhones: [member.phone] }).post('/v1/auth/login', {
      phone: member.phone,
      pin: member.pin,
    });
    expect(login.status).toBeGreaterThanOrEqual(400);
    // The members list no longer carries their name.
    const members = await api(admin).get(`/v1/groups/${groupId}/members`);
    expect(JSON.stringify(members.body)).not.toContain(user.name);
  });

  it('is open to a member who has nothing left anywhere', async () => {
    const user = await signUp();
    const card = await api(user).post('/v1/me/account-deletion');
    expect(card.status).toBe(201);
    expect((await confirm(user, card.body.action.id, TEST_PIN)).status).toBe(200);
    expect(
      (await getPrisma().user.findUniqueOrThrow({ where: { id: user.id } })).deletedAt,
    ).not.toBeNull();
  });
});
