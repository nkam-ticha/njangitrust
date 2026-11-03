// PIN reset (spec 2.10, D8): request (answered the same whether or not the phone has an account),
// confirmation by the admin or by two members (pin-reset.actions.ts), then the one-time link.
// The reset is logged, the group is told, and withdrawals are held for numberChangeHoldHours
// (the withdrawal service reads User.pinResetAt through @njangi/rules `activeHold`).
import type { PinResetCompleteRequest } from '@njangi/shared/contracts/auth';
import { authTexts } from '@njangi/shared/i18n/server/auth';
import { AfterCommit } from '../../lib/after-commit';
import { clock } from '../../lib/clock';
import { hashLinkToken, hashPhone, safeEqual } from '../../lib/crypto';
import { getPrisma, withTransaction } from '../../lib/prisma';
import { bilingual, ui } from '../../lib/texts';
import { lazyLimiter } from '../../http/rate-limit';
import type { ClientKind } from '../../permissions/actor';
import { disconnectUser } from '../../realtime/emitter';
import { audit } from '../audit';
import { postSystemMessage } from '../chat';
import { getCurrentParams } from '../rulesets';
import { createNotifications, type NotificationInput } from '../notifications';
import { authError } from './auth.errors';
import { clearFailures, loginAttempts, loginKey, recordFailure, resetLinkAttempts } from './lockout';
import { assertPinAcceptable, hashPin } from './pin';
import { loadReview } from './pin-reset.review';
import { revokeAllForUser } from './refresh-tokens';
import { startSession, type SessionTokens } from './sessions';

const REQUEST_TTL_MS = 24 * 60 * 60 * 1000;
const READABLE = ['INVITED', 'ACTIVE', 'LEAVING'] as const;
const PARTICIPANTS = ['ACTIVE', 'LEAVING'] as const;

/** Three requests a day per phone, so nobody can flood a group's admin. */
const requestsPerPhone = lazyLimiter({ name: 'pin-reset-request', points: 3, durationSeconds: 86_400 });

/** User ids that may confirm, per group (admin; for the admin, the other active members). */
async function confirmersOf(userId: string): Promise<Map<string, string[]>> {
  const memberships = await getPrisma().membership.findMany({
    where: { userId, status: { in: [...READABLE] }, group: { status: { not: 'CLOSED' } } },
    select: {
      groupId: true,
      role: true,
      group: {
        select: {
          memberships: {
            where: { status: { in: [...PARTICIPANTS] }, userId: { not: userId } },
            select: { userId: true, role: true },
          },
        },
      },
    },
  });
  const byGroup = new Map<string, string[]>();
  for (const m of memberships) {
    const others = m.group.memberships;
    const confirmers = m.role === 'ADMIN' ? others : others.filter((o) => o.role === 'ADMIN');
    if (confirmers.length > 0) byGroup.set(m.groupId, confirmers.map((c) => c.userId));
  }
  return byGroup;
}

export async function requestPinReset(phone: string): Promise<void> {
  try {
    await requestsPerPhone.get().consume(`p:${hashPhone(phone)}`);
  } catch {
    return; // Same answer as any other request; the admins are simply not asked again today.
  }
  const prisma = getPrisma();
  const now = clock.now();
  const user = await prisma.user.findUnique({ where: { loginPhone: phone }, select: { id: true, name: true, deletedAt: true } });
  if (!user || user.deletedAt) return;

  await prisma.pinReset.updateMany({
    where: {
      userId: user.id,
      OR: [
        { status: 'REQUESTED', requestExpiresAt: { lte: now } },
        { status: 'APPROVED', linkExpiresAt: { lte: now } },
      ],
    },
    data: { status: 'EXPIRED' },
  });
  const open = await prisma.pinReset.findFirst({
    where: { userId: user.id, status: { in: ['REQUESTED', 'APPROVED'] } },
    select: { id: true },
  });
  if (open) return;

  const confirmers = await confirmersOf(user.id);
  const effects = new AfterCommit();
  await withTransaction(async (tx) => {
    const reset = await tx.pinReset.create({
      data: { userId: user.id, requestExpiresAt: new Date(now.getTime() + REQUEST_TTL_MS) },
    });
    const notifications: NotificationInput[] = [];
    for (const [groupId, userIds] of confirmers) {
      for (const confirmerId of userIds) {
        notifications.push({
          userId: confirmerId,
          groupId,
          category: 'GROUP',
          title: authTexts.pinResetRequestedTitle,
          body: bilingual(authTexts.pinResetRequestedBody, { name: user.name }),
          deepLink: `/groups/${groupId}/pin-resets`,
        });
      }
    }
    await createNotifications(notifications, effects, tx);
    await audit(
      {
        action: 'pin.reset.requested',
        actorUserId: user.id,
        target: `PinReset:${reset.id}`,
        details: { groups: confirmers.size },
      },
      tx,
    );
  });
  await effects.run();
}

async function findApprovedReset(token: string) {
  const reset = await getPrisma().pinReset.findUnique({
    where: { tokenHash: hashLinkToken(token) },
    select: {
      id: true,
      status: true,
      linkExpiresAt: true,
      approvedInGroupId: true,
      user: { select: { id: true, name: true, loginPhone: true, deletedAt: true } },
    },
  });
  if (!reset || reset.status !== 'APPROVED' || !reset.linkExpiresAt || reset.user.deletedAt) {
    throw authError('PIN_RESET_LINK_INVALID');
  }
  if (reset.linkExpiresAt <= clock.now()) throw authError('PIN_RESET_LINK_INVALID');
  return { ...reset, linkExpiresAt: reset.linkExpiresAt };
}

/** What the reset page shows before the member types their number and new PIN. */
export async function previewPinResetLink(token: string): Promise<{ name: string; expiresAt: Date }> {
  const reset = await findApprovedReset(token);
  return { name: reset.user.name, expiresAt: reset.linkExpiresAt };
}

export async function completePinReset(
  token: string,
  input: PinResetCompleteRequest,
  client: ClientKind,
): Promise<{ userId: string; session: SessionTokens }> {
  const reset = await findApprovedReset(token);
  const attemptsKey = `r:${reset.id}`;
  if (!safeEqual(reset.user.loginPhone, input.phone)) {
    const failure = await recordFailure(resetLinkAttempts, attemptsKey);
    if (failure.locked) {
      await getPrisma().pinReset.updateMany({ where: { id: reset.id, status: 'APPROVED' }, data: { status: 'CANCELLED' } });
      await audit({ action: 'pin.reset.link_burned', actorUserId: reset.user.id, target: `PinReset:${reset.id}` });
      throw authError('PIN_RESET_LINK_INVALID');
    }
    throw authError('PIN_RESET_PHONE_MISMATCH', { details: { attemptsLeft: failure.attemptsLeft } });
  }
  const numbers = await getPrisma().paymentNumber.findMany({ where: { userId: reset.user.id }, select: { number: true } });
  assertPinAcceptable(input.newPin, [reset.user.loginPhone, ...numbers.map((n) => n.number)]);
  const pinHash = await hashPin(input.newPin);

  const effects = new AfterCommit();
  const session = await withTransaction(async (tx) => {
    const now = clock.now();
    const claimed = await tx.pinReset.updateMany({
      where: { id: reset.id, status: 'APPROVED', linkExpiresAt: { gt: now } },
      data: { status: 'COMPLETED', completedAt: now },
    });
    if (claimed.count !== 1) throw authError('PIN_RESET_LINK_INVALID');
    const user = await tx.user.update({
      where: { id: reset.user.id },
      data: { pinHash, pinResetAt: now, pinChangedAt: now, sessionEpoch: { increment: 1 } },
      select: { id: true, sessionEpoch: true },
    });
    await revokeAllForUser(tx, user.id, 'PIN_RESET');
    const groups = await tx.membership.findMany({
      where: { userId: user.id, status: { in: [...READABLE] } },
      select: { groupId: true },
    });
    for (const { groupId } of groups) {
      const { numberChangeHoldHours: hours } = await getCurrentParams(groupId, tx);
      await postSystemMessage(groupId, ui((c) => c.chat.system.pinReset, { name: reset.user.name, hours }), effects, tx);
    }
    await createNotifications(
      [{ userId: user.id, category: 'SECURITY', title: authTexts.pinResetDoneTitle, body: authTexts.pinResetDoneBody }],
      effects,
      tx,
    );
    await audit(
      { action: 'pin.reset.completed', actorUserId: user.id, groupId: reset.approvedInGroupId, target: `PinReset:${reset.id}` },
      tx,
    );
    return startSession(tx, user, client);
  });
  disconnectUser(reset.user.id);
  await effects.run();
  await clearFailures(loginAttempts, loginKey(reset.user.loginPhone));
  await clearFailures(resetLinkAttempts, attemptsKey);
  return { userId: reset.user.id, session };
}


/**
 * "Je ne reconnais pas cette demande": any member who may confirm can stop the request. It only
 * reduces risk, so it needs no confirmation card. The requester is told.
 */
export async function declinePinReset(reviewerUserId: string, groupId: string, pinResetId: string): Promise<void> {
  const review = await loadReview(reviewerUserId, groupId, pinResetId);
  const effects = new AfterCommit();
  await withTransaction(async (tx) => {
    const cancelled = await tx.pinReset.updateMany({
      where: { id: pinResetId, status: 'REQUESTED' },
      data: { status: 'CANCELLED' },
    });
    if (cancelled.count !== 1) throw authError('PIN_RESET_NOT_FOUND');
    await createNotifications(
      [
        {
          userId: review.requesterUserId,
          category: 'SECURITY',
          title: authTexts.pinResetDeclinedTitle,
          body: authTexts.pinResetDeclinedBody,
        },
      ],
      effects,
      tx,
    );
    await audit(
      { action: 'pin.reset.declined', actorUserId: reviewerUserId, groupId, target: `PinReset:${pinResetId}` },
      tx,
    );
  });
  await effects.run();
}
