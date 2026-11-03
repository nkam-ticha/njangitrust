// Sign-up, login, refresh, logout and PIN change (spec 2.10, D1).
import type { LoginRequest, PinChangeRequest, SignupRequest } from '@njangi/shared/contracts/auth';
import { authTexts } from '@njangi/shared/i18n/server/auth';
import { AfterCommit } from '../../lib/after-commit';
import { clock } from '../../lib/clock';
import { getPrisma, withTransaction } from '../../lib/prisma';
import type { AuthActor, ClientKind } from '../../permissions/actor';
import { disconnectUser } from '../../realtime/emitter';
import type { SelfSource } from '../../dto';
import { audit } from '../audit';
import { getSelfSource } from '../me';
import { createNotifications, notify } from '../notifications';
import { insertAccount, prepareAccount } from './accounts';
import { authError } from './auth.errors';
import {
  actionPinAttempts,
  clearFailures,
  lockMinutes,
  lockState,
  loginAttempts,
  loginKey,
  recordFailure,
} from './lockout';
import { assertPinAcceptable, burnPinCheck, hashPin, verifyPin } from './pin';
import { revokeAllForUser, revokeFamily, rotateRefreshToken, familyOfToken } from './refresh-tokens';
import { continueSession, startSession, type SessionTokens } from './sessions';

export interface AuthResult {
  self: SelfSource;
  session: SessionTokens;
}

export async function signup(input: SignupRequest, client: ClientKind): Promise<AuthResult> {
  const account = await prepareAccount(input);
  const { userId, session } = await withTransaction(async (tx) => {
    const user = await insertAccount(tx, account);
    await audit({ action: 'auth.signup', actorUserId: user.id, target: `User:${user.id}` }, tx);
    return { userId: user.id, session: await startSession(tx, user, client) };
  });
  return { self: await getSelfSource(userId), session };
}

export async function login(input: LoginRequest, client: ClientKind): Promise<AuthResult> {
  const key = loginKey(input.phone);
  const lock = await lockState(loginAttempts, key);
  if (lock.locked) {
    throw authError('LOGIN_LOCKED', {
      params: { minutes: lockMinutes(lock.retryAfterSeconds) },
      details: { retryAfterSeconds: lock.retryAfterSeconds },
    });
  }
  const user = await getPrisma().user.findUnique({
    where: { loginPhone: input.phone },
    select: { id: true, pinHash: true, sessionEpoch: true, deletedAt: true },
  });
  const valid = user && !user.deletedAt ? await verifyPin(user.pinHash, input.pin) : false;
  if (!user || user.deletedAt) await burnPinCheck(input.pin);

  if (!valid || !user) {
    const failure = await recordFailure(loginAttempts, key);
    if (user) await audit({ action: 'auth.login.failed', actorUserId: user.id, details: { locked: failure.locked } });
    if (failure.locked) {
      throw authError('LOGIN_LOCKED', {
        params: { minutes: lockMinutes(failure.retryAfterSeconds) },
        details: { retryAfterSeconds: failure.retryAfterSeconds },
      });
    }
    throw authError(failure.attemptsLeft === 1 ? 'INVALID_CREDENTIALS_LAST_ATTEMPT' : 'INVALID_CREDENTIALS', {
      details: { attemptsLeft: failure.attemptsLeft },
    });
  }
  await clearFailures(loginAttempts, key);
  const session = await startSession(getPrisma(), user, client);
  return { self: await getSelfSource(user.id), session };
}

/** Rotates a refresh token. Reuse of an old token revokes its family and warns the member. */
export async function refresh(token: string): Promise<SessionTokens> {
  const result = await rotateRefreshToken(token);
  if (result.ok) return continueSession(result.userId, result.client, result.issued);
  if (result.reason === 'REUSED') {
    const effects = new AfterCommit();
    await withTransaction(async (tx) => {
      await revokeFamily(tx, result.familyId, 'REUSE_DETECTED');
      await audit({ action: 'auth.refresh.reuse_detected', actorUserId: result.userId }, tx);
      await createNotifications(
        [{ userId: result.userId, category: 'SECURITY', title: authTexts.sessionReusedTitle, body: authTexts.sessionReusedBody }],
        effects,
        tx,
      );
    });
    await effects.run();
    throw authError('SESSION_REUSED');
  }
  throw authError('SESSION_INVALID');
}

/** Ends one login (this device): by its refresh token, or by the session of the access token. */
export async function logout(input: { refreshToken?: string; actor?: AuthActor }): Promise<void> {
  const family = input.refreshToken ? await familyOfToken(input.refreshToken) : null;
  const familyId = family?.familyId ?? input.actor?.sessionId;
  if (!familyId) return;
  await revokeFamily(getPrisma(), familyId, 'LOGOUT');
}

/** Spec 2.10: revokes every refresh token and, through the epoch, every access token. */
export async function logoutEverywhere(actor: AuthActor): Promise<void> {
  await withTransaction(async (tx) => {
    await revokeAllForUser(tx, actor.userId, 'LOGOUT_ALL');
    await tx.user.update({ where: { id: actor.userId }, data: { sessionEpoch: { increment: 1 } } });
    await audit({ action: 'auth.logout_all', actorUserId: actor.userId }, tx);
  });
  disconnectUser(actor.userId);
}

/**
 * Checks the member's PIN for a PIN-protected action (L2 confirmations, PIN change), with its own
 * five-attempt lockout.
 */
export async function verifyMemberPin(userId: string, pin: string | undefined): Promise<void> {
  if (!pin) throw authError('PIN_REQUIRED');
  const lock = await lockState(actionPinAttempts, userId);
  if (lock.locked) {
    throw authError('PIN_LOCKED', {
      params: { minutes: lockMinutes(lock.retryAfterSeconds) },
      details: { retryAfterSeconds: lock.retryAfterSeconds },
    });
  }
  const user = await getPrisma().user.findUniqueOrThrow({ where: { id: userId }, select: { pinHash: true } });
  if (await verifyPin(user.pinHash, pin)) {
    await clearFailures(actionPinAttempts, userId);
    return;
  }
  const failure = await recordFailure(actionPinAttempts, userId);
  await audit({ action: 'auth.pin.failed', actorUserId: userId, details: { locked: failure.locked } });
  if (failure.locked) {
    throw authError('PIN_LOCKED', {
      params: { minutes: lockMinutes(failure.retryAfterSeconds) },
      details: { retryAfterSeconds: failure.retryAfterSeconds },
    });
  }
  throw authError(failure.attemptsLeft === 1 ? 'PIN_INCORRECT_LAST_ATTEMPT' : 'PIN_INCORRECT', {
    details: { attemptsLeft: failure.attemptsLeft },
  });
}

/** Changes the PIN; every other session ends and this client gets a new one. */
export async function changePin(actor: AuthActor, input: PinChangeRequest): Promise<SessionTokens> {
  await verifyMemberPin(actor.userId, input.currentPin);
  if (input.newPin === input.currentPin) throw authError('PIN_SAME_AS_OLD');
  const self = await getSelfSource(actor.userId);
  assertPinAcceptable(input.newPin, [self.user.loginPhone, ...(self.paymentNumber ? [self.paymentNumber.number] : [])]);
  const pinHash = await hashPin(input.newPin);
  const session = await withTransaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: actor.userId },
      data: { pinHash, pinChangedAt: clock.now(), sessionEpoch: { increment: 1 } },
      select: { id: true, sessionEpoch: true },
    });
    await revokeAllForUser(tx, actor.userId, 'PIN_CHANGED');
    await audit({ action: 'auth.pin.changed', actorUserId: actor.userId }, tx);
    return startSession(tx, user, actor.client);
  });
  disconnectUser(actor.userId);
  await notify([
    { userId: actor.userId, category: 'SECURITY', title: authTexts.pinChangedTitle, body: authTexts.pinChangedBody },
  ]);
  return session;
}
