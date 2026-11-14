// Test data built through the real API wherever possible. Every user gets a fresh phone number,
// so test files never collide and nothing needs deleting.
import { randomInt } from 'node:crypto';
import { CURRENT_CONSENT_VERSION } from '@njangi/shared/contracts/auth';
import { hashPhone } from '../../src/lib/crypto';
import { getPrisma } from '../../src/lib/prisma';
import { settleBackground } from '../../src/jobs/dispatch';
import { api, type TestUser } from './client';

/** A PIN no test phone can contain and the PIN policy accepts. */
export const TEST_PIN = '258147';

/** A random MTN number `+23767XXXXXXX` (never ending in 000 or 111, the mock provider's specials). */
const drawn = new Set<string>();

export function uniquePhone(): string {
  for (;;) {
    const rest = String(randomInt(0, 10_000_000)).padStart(7, '0');
    const phone = `+23767${rest}`;
    if (/(000|111)$/.test(phone) || phone.includes(TEST_PIN) || drawn.has(phone)) continue;
    drawn.add(phone);
    return phone;
  }
}

/**
 * A random number that no account in the test database uses yet, as a login or payment number.
 * The test database keeps every earlier run's users, so a bare random draw can collide.
 */
export async function freshPhone(): Promise<string> {
  for (;;) {
    const phone = uniquePhone();
    const [users, numbers] = await Promise.all([
      getPrisma().user.count({ where: { loginPhone: phone } }),
      getPrisma().paymentNumber.count({ where: { number: phone } }),
    ]);
    if (users === 0 && numbers === 0) return phone;
  }
}

let counter = 0;
const PEOPLE = [
  'Carine Fotso',
  'Paul Mbarga',
  'Joël Ndi',
  'Mireille Atangana',
  'Sandrine Ewane',
  'Brice Tchakounté',
];
export function personName(): string {
  counter += 1;
  return `${PEOPLE[counter % PEOPLE.length]} ${String.fromCharCode(65 + (counter % 26))}`;
}

export function signupBody(overrides: Record<string, unknown> = {}) {
  return {
    name: personName(),
    phone: uniquePhone(),
    consent: true,
    consentVersion: CURRENT_CONSENT_VERSION,
    pin: TEST_PIN,
    ...overrides,
  };
}

/** The numbers a sign-up body declares as the person's own. */
export function ownPhonesOf(body: { phone: unknown; paymentNumber?: unknown }): string[] {
  const payment = (body.paymentNumber as { number?: string } | undefined)?.number;
  return [String(body.phone), ...(payment ? [payment] : [])];
}

interface AuthBody {
  user: { id: string; name: string; phone: string; paymentNumber: { number: string } | null };
  session: { accessToken: string; refreshToken?: string };
}

export function toTestUser(body: AuthBody, pin = TEST_PIN): TestUser {
  return {
    id: body.user.id,
    name: body.user.name,
    phone: body.user.phone,
    paymentNumber: body.user.paymentNumber?.number ?? body.user.phone,
    pin,
    accessToken: body.session.accessToken,
    refreshToken: body.session.refreshToken ?? '',
  };
}

export async function signUp(overrides: Record<string, unknown> = {}): Promise<TestUser> {
  const body = signupBody({ phone: await freshPhone(), ...overrides });
  const res = await api(null, { ownPhones: ownPhonesOf(body) }).post('/v1/auth/signup', body);
  if (res.status !== 201)
    throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return toTestUser(res.body as AuthBody);
}

/** A first payout two months ahead, at 18:00 Douala time (17:00 UTC). */
export function futurePayout(): string {
  const d = new Date(Date.now() + 60 * 86_400_000);
  d.setUTCHours(17, 0, 0, 0);
  return d.toISOString();
}

export async function createGroup(admin: TestUser, overrides: Record<string, unknown> = {}) {
  const res = await api(admin).post('/v1/groups', {
    name: 'Njangi des Collègues',
    firstPayoutAt: futurePayout(),
    ...overrides,
  });
  if (res.status !== 201)
    throw new Error(`group creation failed: ${res.status} ${JSON.stringify(res.body)}`);
  return {
    groupId: res.body.group.id as string,
    adminMembershipId: res.body.me.membershipId as string,
  };
}

/** Confirms a pending action as `user`; returns the response. */
/** Confirms an action, then waits for the jobs it started (e.g. `votes.close`). */
export async function confirm(user: TestUser, actionId: string, pin?: string) {
  const res = await api(user).post(`/v1/pending-actions/${actionId}/confirm`, pin ? { pin } : {});
  await settleBackground();
  return res;
}

/** The admin invites someone (card + confirm) and returns the one-time link token. */
export async function inviteToken(
  admin: TestUser,
  groupId: string,
  invitee: { name: string; phone: string; proposalId?: string },
) {
  const body = {
    name: invitee.name,
    phone: invitee.phone,
    ...(invitee.proposalId ? { proposalId: invitee.proposalId } : {}),
  };
  const created = await api(admin).post(`/v1/groups/${groupId}/invites`, body);
  if (created.status !== 201)
    throw new Error(`invite request failed: ${created.status} ${JSON.stringify(created.body)}`);
  const confirmed = await confirm(admin, created.body.action.id);
  if (confirmed.status !== 200)
    throw new Error(`invite confirm failed: ${confirmed.status} ${JSON.stringify(confirmed.body)}`);
  return String(confirmed.body.data.link).split('/invite/')[1]!;
}

/** A new person joins `groupId` through a founding invite. */
export async function addMember(
  admin: TestUser,
  groupId: string,
): Promise<TestUser & { membershipId: string }> {
  const body = signupBody({ phone: await freshPhone() });
  const token = await inviteToken(admin, groupId, { name: body.name, phone: body.phone });
  const res = await api(null, { ownPhones: ownPhonesOf(body) }).post(
    `/v1/auth/invites/${token}/accept`,
    { mode: 'signup', ...body },
  );
  if (res.status !== 201)
    throw new Error(`accept failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { ...toTestUser(res.body as AuthBody), membershipId: res.body.me.membershipId as string };
}

/** What the cycles module will do when the first cycle starts: the group becomes ACTIVE. */
export async function markFirstCycleStarted(groupId: string): Promise<void> {
  const prisma = getPrisma();
  const group = await prisma.group.findUniqueOrThrow({ where: { id: groupId } });
  const cycle = await prisma.cycle.create({
    data: {
      groupId,
      number: 1,
      mode: 'FIXED',
      firstPayoutAt: group.firstPayoutAt,
      startedAt: new Date(),
    },
  });
  await prisma.group.update({
    where: { id: groupId },
    data: { status: 'ACTIVE', currentCycleId: cycle.id },
  });
}

/** Approved proposal stub (Phase 0 done-when): a PASSED MEMBER_ADD for this person. */
export async function passedMemberAdd(
  groupId: string,
  proposerMembershipId: string,
  person: { name: string; phone: string },
) {
  const now = new Date();
  const proposal = await getPrisma().proposal.create({
    data: {
      groupId,
      type: 'MEMBER_ADD',
      payload: { inviteeName: person.name, phoneHash: hashPhone(person.phone) },
      proposerMembershipId,
      secret: false,
      thresholdKind: 'MAJORITY',
      eligibleMembershipIds: [proposerMembershipId],
      yesCount: 1,
      opensAt: now,
      closesAt: new Date(now.getTime() + 72 * 3_600_000),
      status: 'PASSED',
      closedAt: now,
      appliedAt: now,
    },
  });
  return proposal.id;
}

export async function setMembershipStatus(
  membershipId: string,
  status: 'LEFT' | 'REMOVED' | 'LEAVING' | 'INVITED',
) {
  await getPrisma().membership.update({
    where: { id: membershipId },
    data: { status, ...(status === 'LEFT' || status === 'REMOVED' ? { leftAt: new Date() } : {}) },
  });
}
