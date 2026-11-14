import { afterEach, describe, expect, it } from 'vitest';
import { advanceTestClock, resetTestClock, setTestClock } from '../../../lib/clock';
import { getPrisma } from '../../../lib/prisma';
import { settleBackground } from '../../../jobs/dispatch';
import { api, type TestUser } from '../../../../test/helpers/client';
import {
  addMember,
  confirm,
  createGroup,
  inviteToken,
  signUp,
  uniquePhone,
} from '../../../../test/helpers/factories';

const NEW_PIN = '530826';

/** Asks for a reset and waits for the background work (the answer comes first, L4). */
async function requestReset(phone: string) {
  const res = await api().post('/v1/auth/pin/reset-request', { phone });
  await settleBackground();
  return res;
}
const loginAs = (phone: string, pin: string) =>
  api(null, { ownPhones: [phone] }).post('/v1/auth/login', { phone, pin });

describe('PIN change (spec 2.10)', () => {
  it('needs the current PIN, refuses weak or unchanged PINs, then ends every other session', async () => {
    const user = await signUp();
    expect(
      (await api(user).post('/v1/auth/pin/change', { currentPin: '904713', newPin: NEW_PIN })).body
        .code,
    ).toBe('PIN_INCORRECT');
    expect(
      (await api(user).post('/v1/auth/pin/change', { currentPin: user.pin, newPin: user.pin })).body
        .code,
    ).toBe('PIN_SAME_AS_OLD');
    expect(
      (await api(user).post('/v1/auth/pin/change', { currentPin: user.pin, newPin: '000000' })).body
        .code,
    ).toBe('PIN_TOO_WEAK');

    const changed = await api(user).post('/v1/auth/pin/change', {
      currentPin: user.pin,
      newPin: NEW_PIN,
    });
    expect(changed.status).toBe(200);
    expect((await api(user).get('/v1/me')).status).toBe(401);
    expect(
      (await api({ ...user, accessToken: changed.body.session.accessToken }).get('/v1/me')).status,
    ).toBe(200);
    expect((await loginAs(user.phone, user.pin)).status).toBe(401);
    expect((await loginAs(user.phone, NEW_PIN)).status).toBe(200);
    const notice = await getPrisma().notification.findFirst({
      where: { userId: user.id, category: 'SECURITY' },
    });
    expect(notice?.titleFr).toBe('Code PIN modifié');
  });
});

async function approvalCard(reviewer: TestUser, groupId: string, resetId: string) {
  return api(reviewer).post(`/v1/groups/${groupId}/pin-resets/${resetId}/approvals`);
}

async function openRequests(reviewer: TestUser, groupId: string) {
  return (await api(reviewer).get(`/v1/groups/${groupId}/pin-resets`)).body.requests as Array<{
    id: string;
    confirmationsNeeded: number;
    confirmationsGiven: number;
  }>;
}

describe('PIN reset of a member: the admin confirms (spec 2.10, D14)', () => {
  afterEach(() => resetTestClock());

  it('runs request, confirmation with the admin’s PIN, the 24-hour wait, one-time link, and the hold', async () => {
    setTestClock(new Date());
    const admin = await signUp();
    const { groupId } = await createGroup(admin);
    const paul = await addMember(admin, groupId);
    const other = await addMember(admin, groupId);

    const asked = await requestReset(paul.phone);
    const unknown = await requestReset(uniquePhone());
    expect(asked.status).toBe(202);
    expect(unknown.body).toEqual(asked.body);
    const ownerNotices = () =>
      getPrisma().notification.findMany({
        where: { userId: paul.id, category: 'SECURITY' },
        orderBy: { createdAt: 'asc' },
      });
    // D14: the account owner is warned, with a link the app turns into "Annuler la demande".
    expect((await ownerNotices()).map((n) => n.deepLink)).toEqual([
      expect.stringContaining('pin-reset'),
    ]);

    expect(await openRequests(other, groupId)).toEqual([]);
    const [request] = await openRequests(admin, groupId);
    expect(request).toMatchObject({ confirmationsNeeded: 1, confirmationsGiven: 0 });
    expect((await approvalCard(other, groupId, request!.id)).body.code).toBe(
      'PIN_RESET_NOT_ALLOWED',
    );

    const card = await approvalCard(admin, groupId, request!.id);
    expect(card.status).toBe(201);
    expect(card.body.action).toMatchObject({ level: 'L2', requiresPin: true });
    expect((await confirm(admin, card.body.action.id)).body.code).toBe('PIN_REQUIRED');
    expect((await confirm(admin, card.body.action.id, '904713')).body.code).toBe('PIN_INCORRECT');
    const approved = await confirm(admin, card.body.action.id, admin.pin);
    expect(approved.status).toBe(200);
    expect(approved.body.data).toMatchObject({
      approved: true,
      link: expect.stringContaining('/reset-pin/'),
    });
    const token = String(approved.body.data.link).split('/reset-pin/')[1]!;
    expect(await ownerNotices()).toHaveLength(2);

    // D14: nothing works during the 24-hour wait; the app is told when it will.
    const early = await api().get(`/v1/auth/pin/reset/${token}`);
    expect(early.status).toBe(409);
    expect(early.body.code).toBe('PIN_RESET_LINK_NOT_YET');
    expect(early.body.details.usableFrom).toBe(approved.body.data.linkUsableFrom);
    advanceTestClock(24 * 3_600_000 + 1_000);

    expect((await api().get(`/v1/auth/pin/reset/${token}`)).body.name).toBe(paul.name);
    const wrong = await api().post(`/v1/auth/pin/reset/${token}`, {
      phone: other.phone,
      newPin: NEW_PIN,
    });
    expect(wrong.body.code).toBe('PIN_RESET_PHONE_MISMATCH');
    const done = await api(null, { ownPhones: [paul.phone] }).post(`/v1/auth/pin/reset/${token}`, {
      phone: paul.phone,
      newPin: NEW_PIN,
    });
    expect(done.status).toBe(200);

    expect((await api(paul).get('/v1/me')).status).toBe(401);
    expect((await loginAs(paul.phone, NEW_PIN)).status).toBe(200);
    expect(
      (await api().post(`/v1/auth/pin/reset/${token}`, { phone: paul.phone, newPin: '904713' }))
        .body.code,
    ).toBe('PIN_RESET_LINK_INVALID');

    const user = await getPrisma().user.findUniqueOrThrow({ where: { id: paul.id } });
    expect(user.pinResetAt).not.toBeNull();
    const message = await getPrisma().message.findFirst({
      where: { groupId, kind: 'SYSTEM' },
      orderBy: { createdAt: 'desc' },
    });
    expect((message?.systemText as { fr: string }).fr).toMatch(
      /a réinitialisé son code PIN\. Ses retraits attendent 48\sh\./,
    );
    const audit = await getPrisma().auditLog.findMany({
      where: { target: `PinReset:${request!.id}` },
      select: { action: true },
    });
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(['pin.reset.requested', 'pin.reset.approved', 'pin.reset.completed']),
    );
  });
});

describe('PIN reset of the admin: two other members confirm (D8)', () => {
  it('needs two different members; the second one gets the link', async () => {
    const admin = await signUp();
    const { groupId } = await createGroup(admin);
    const carine = await addMember(admin, groupId);
    const joel = await addMember(admin, groupId);
    await requestReset(admin.phone);

    const [request] = await openRequests(carine, groupId);
    expect(request).toMatchObject({ confirmationsNeeded: 2, confirmationsGiven: 0 });
    const first = await confirm(
      carine,
      (await approvalCard(carine, groupId, request!.id)).body.action.id,
      carine.pin,
    );
    expect(first.body.data).toEqual({ type: 'PIN_RESET_APPROVE', approved: false });
    expect((await approvalCard(carine, groupId, request!.id)).body.code).toBe(
      'PIN_RESET_ALREADY_CONFIRMED',
    );

    const second = await confirm(
      joel,
      (await approvalCard(joel, groupId, request!.id)).body.action.id,
      joel.pin,
    );
    expect(second.body.data).toMatchObject({
      approved: true,
      link: expect.stringContaining('/reset-pin/'),
    });
  });

  it('lets a member decline a request they don’t recognise', async () => {
    const admin = await signUp();
    const { groupId } = await createGroup(admin);
    const carine = await addMember(admin, groupId);
    await addMember(admin, groupId);
    await requestReset(admin.phone);
    const [request] = await openRequests(carine, groupId);
    expect(
      (await api(carine).post(`/v1/groups/${groupId}/pin-resets/${request!.id}/decline`)).status,
    ).toBe(204);
    expect(await openRequests(carine, groupId)).toEqual([]);
    const notices = await getPrisma().notification.findMany({
      where: { userId: admin.id, category: 'SECURITY' },
      orderBy: { createdAt: 'asc' },
    });
    expect(notices.map((n) => n.titleEn)).toEqual(['New PIN request', 'New PIN request declined']);
  });

  it('lets the account owner cancel a reset in progress (D14)', async () => {
    const admin = await signUp();
    const { groupId } = await createGroup(admin);
    const paul = await addMember(admin, groupId);
    await requestReset(paul.phone);
    expect(await openRequests(admin, groupId)).toHaveLength(1);
    expect((await api(paul).post('/v1/me/pin-reset/cancel')).status).toBe(204);
    expect(await openRequests(admin, groupId)).toEqual([]);
    expect((await api(paul).post('/v1/me/pin-reset/cancel')).body.code).toBe(
      'PIN_RESET_NONE_PENDING',
    );
    const logged = await getPrisma().auditLog.count({
      where: { actorUserId: paul.id, action: 'pin.reset.cancelled_by_owner' },
    });
    expect(logged).toBe(1);
  });

  it('applies the two-member rule to an admin of any open group (D14)', async () => {
    const paulAdmin = await signUp();
    await createGroup(paulAdmin, { name: 'Njangi du quartier' });
    const otherAdmin = await signUp();
    const { groupId } = await createGroup(otherAdmin);
    const token = await inviteToken(otherAdmin, groupId, {
      name: paulAdmin.name,
      phone: paulAdmin.phone,
    });
    await api(paulAdmin).post(`/v1/auth/invites/${token}/accept`, { mode: 'existing' });
    await addMember(otherAdmin, groupId);
    await requestReset(paulAdmin.phone);
    const [request] = await openRequests(otherAdmin, groupId);
    expect(request).toMatchObject({ confirmationsNeeded: 2 });
  });
});

describe('an open PIN reset ends when the owner shows they know their PIN (privacy-guard L-4)', () => {
  async function pendingReset() {
    const admin = await signUp();
    const { groupId } = await createGroup(admin);
    const paul = await addMember(admin, groupId);
    await requestReset(paul.phone);
    expect(await openRequests(admin, groupId)).toHaveLength(1);
    return { admin, groupId, paul };
  }

  async function expectCancelled(userId: string, reason: string) {
    const logged = await getPrisma().auditLog.findMany({
      where: { actorUserId: userId, action: 'pin.reset.auto_cancelled' },
    });
    expect(logged.map((a) => a.details)).toEqual([{ reason }]);
    const notices = await getPrisma().notification.findMany({
      where: { userId, category: 'SECURITY', titleEn: 'New PIN request cancelled' },
    });
    expect(notices).toHaveLength(1);
  }

  it('is cancelled by a successful login, logged, and the owner is told', async () => {
    const { admin, groupId, paul } = await pendingReset();
    expect((await loginAs(paul.phone, '904713')).status).toBe(401);
    expect(await openRequests(admin, groupId)).toHaveLength(1);
    expect((await loginAs(paul.phone, paul.pin)).status).toBe(200);
    expect(await openRequests(admin, groupId)).toEqual([]);
    await expectCancelled(paul.id, 'LOGIN');
  });

  it('is cancelled by a PIN change', async () => {
    const { admin, groupId, paul } = await pendingReset();
    const changed = await api(paul).post('/v1/auth/pin/change', {
      currentPin: paul.pin,
      newPin: NEW_PIN,
    });
    expect(changed.status).toBe(200);
    expect(await openRequests(admin, groupId)).toEqual([]);
    await expectCancelled(paul.id, 'PIN_CHANGED');
  });
});
