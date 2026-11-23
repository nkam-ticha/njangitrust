// The member's own account (R13 payment number, PRV-03 deletion). The two changes are cards the
// member confirms with their PIN (account.actions.ts); this file holds what they check and do.
import { accountTexts as t } from '@njangi/shared/i18n/server/account';
import { detectOperator, normalizeCameroonPhone, type Lang } from '@njangi/shared';
import { hashPhone } from '../../lib/crypto';
import type { EffectSink } from '../../lib/after-commit';
import type { Db, Prisma } from '../../lib/prisma';
import { lockGroup } from '../../permissions';
import { disconnectUser } from '../../realtime/emitter';
import { audit } from '../audit';
import { createPendingAction, type ActionOrigin } from '../pending-actions';
import { accountError } from './account.errors';
import { holdsMoney, moneyHeldBy } from './account.money';

type Tx = Prisma.TransactionClient;
type BlockerCode = Parameters<typeof accountError>[0];

/** A payment number as typed, normalised, with its operator; refuses what is not a Cameroon number. */
export function normaliseNumber(
  raw: string,
  operator?: 'MTN' | 'ORANGE',
): { number: string; operator: 'MTN' | 'ORANGE' } {
  const number = normalizeCameroonPhone(raw);
  if (!number) throw accountError('NUMBER_NOT_VALID');
  const detected = detectOperator(number);
  const chosen = operator ?? (detected === 'UNKNOWN' ? undefined : detected);
  if (!chosen) throw accountError('OPERATOR_REQUIRED');
  return { number, operator: chosen };
}

/** What an erased payment number reads: it still has the format the database requires. */
export const ERASED_NUMBER = '+237600000000';

const OPEN = ['CREATED', 'PENDING', 'EXPIRED'] as const;
/** Cards that start a payment or a send: CONFIRMED while the operator is asked (and until the row exists). */
const MONEY_CARDS = ['PAY', 'WITHDRAW'];

/**
 * Locks what a confirmation locks, in its order (its card, then Group, then Membership), so a
 * deletion either waits for an operation being confirmed or finds it when it counts (D28). Call it
 * first, in the transaction that goes on to `deletionBlocker`. The cards come first and are
 * waited for: a confirmation that already claimed its card finishes (it waits for nothing this
 * transaction holds yet), and one that has not claimed it finds it cancelled. Waiting last, on
 * the card, is what deadlocked: the confirmation holds its card and waits for the group.
 */
export async function lockAccountOperations(db: Db, userId: string): Promise<void> {
  await db.$queryRaw`SELECT "id" FROM "PendingAction" WHERE "userId" = ${userId}::uuid AND "status" IN ('PENDING', 'CONFIRMED') ORDER BY "id" FOR UPDATE`;
  // The groups, read again after each round of locks: a membership that appeared meanwhile has
  // its group locked too (ascending within a round), before the membership rows are.
  const locked = new Set<string>();
  const lockNewGroups = async (): Promise<number> => {
    const rows = await db.membership.findMany({
      where: { userId },
      select: { groupId: true },
      orderBy: { groupId: 'asc' },
    });
    const fresh = [...new Set(rows.map((row) => row.groupId))].filter((id) => !locked.has(id));
    for (const groupId of fresh) {
      await lockGroup(db, groupId, 'share');
      locked.add(groupId);
    }
    return fresh.length;
  };
  while ((await lockNewGroups()) > 0) {
    // Until a read finds nothing new.
  }
  await db.$queryRaw`SELECT "id" FROM "Membership" WHERE "userId" = ${userId}::uuid ORDER BY "id" FOR UPDATE`;
  // One last look, for a membership that appeared while the member rows were being locked.
  await lockNewGroups();
}

/**
 * Why this member cannot delete their account yet, or null. Deleting is for a member with no
 * obligation, money or operation left anywhere (spec 4.8 `delete_my_account`): the admin hands
 * the role over first, and a member of a running cycle leaves at the end of it.
 */
export async function deletionBlocker(db: Db, userId: string): Promise<BlockerCode | null> {
  const memberships = await db.membership.findMany({
    where: { userId },
    select: {
      id: true,
      role: true,
      status: true,
      group: { select: { status: true } },
    },
  });
  const ids = memberships.map((m) => m.id);
  const live = memberships.filter(
    (m) => ['ACTIVE', 'LEAVING', 'INVITED'].includes(m.status) && m.group.status !== 'CLOSED',
  );
  if (live.some((m) => m.role === 'ADMIN' && m.status === 'ACTIVE')) return 'DELETE_IS_ADMIN';
  if (live.some((m) => m.group.status === 'ACTIVE' && m.status !== 'INVITED')) {
    return 'DELETE_IN_RUNNING_CYCLE';
  }
  const [intents, sends, requests, cards] = await Promise.all([
    db.paymentIntent.count({ where: { membershipId: { in: ids }, status: { in: [...OPEN] } } }),
    db.disbursement.count({ where: { membershipId: { in: ids }, status: { in: [...OPEN] } } }),
    db.solidarityRequest.count({
      where: { recipientMembershipId: { in: ids }, status: { in: ['VOTING', 'APPROVED'] } },
    }),
    db.pendingAction.count({
      where: { userId, status: 'CONFIRMED', type: { in: MONEY_CARDS } },
    }),
  ]);
  if (intents + sends + requests + cards > 0) return 'DELETE_OPERATION_IN_PROGRESS';
  if (holdsMoney(await moneyHeldBy(db, ids))) return 'DELETE_HAS_OBLIGATIONS';
  return null;
}

/**
 * PRV-03: personal fields are anonymised, financial records stay (the groups' accountability
 * depends on them). The name and numbers go, every login and device is closed, private data
 * (notifications, assistant conversations, reset requests) is erased. The user row stays so the
 * ledger and the chat keep a stable author, now "Former member".
 */
export async function anonymiseAccount(
  tx: Tx,
  userId: string,
  now: Date,
  effects: EffectSink,
  /** The action carrying out the deletion: the only pending one that is kept. */
  exceptActionId?: string,
): Promise<void> {
  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { loginPhone: true },
  });
  const phoneHash = hashPhone(user.loginPhone);
  const memberships = await tx.membership.findMany({
    where: { userId },
    select: { id: true, status: true },
  });
  const ids = memberships.map((m) => m.id);
  await tx.membership.updateMany({
    where: { id: { in: ids }, status: { in: ['ACTIVE', 'LEAVING', 'INVITED'] } },
    data: { status: 'LEFT', leftAt: now },
  });
  await tx.user.update({
    where: { id: userId },
    data: {
      name: t.deletedName.fr,
      loginPhone: `deleted:${userId}`,
      pinHash: 'deleted',
      deletedAt: now,
      // Every access token issued before is refused at once.
      sessionEpoch: { increment: 1 },
    },
  });
  await tx.paymentNumber.updateMany({
    where: { userId },
    data: { number: ERASED_NUMBER },
  });
  await tx.paymentNumber.updateMany({
    where: { userId, activeTo: null },
    data: { activeTo: now },
  });
  await tx.paymentIntent.updateMany({
    where: { membershipId: { in: ids } },
    data: { phoneSnapshot: 'deleted' },
  });
  await tx.disbursement.updateMany({
    where: { membershipId: { in: ids } },
    data: { phoneSnapshot: 'deleted' },
  });
  // The name and the keyed phone hash the person was invited with (an invite, a MEMBER_ADD vote).
  const invites = await tx.invite.findMany({ where: { phoneHash }, select: { id: true } });
  for (const invite of invites) {
    await tx.invite.update({
      where: { id: invite.id },
      data: { inviteeName: t.deletedName.fr, phoneHash: `deleted:${invite.id}` },
    });
  }
  const proposals = await tx.proposal.findMany({
    where: { type: 'MEMBER_ADD', payload: { path: ['phoneHash'], equals: phoneHash } },
    select: { id: true },
  });
  for (const proposal of proposals) {
    await tx.proposal.update({
      where: { id: proposal.id },
      data: { payload: { inviteeName: t.deletedName.fr, phoneHash: `deleted:${proposal.id}` } },
    });
  }
  await tx.uploadTicket.deleteMany({ where: { userId } });
  // What the member had prepared and not confirmed is dropped with them.
  await tx.pendingAction.updateMany({
    where: {
      userId,
      status: 'PENDING',
      ...(exceptActionId ? { id: { not: exceptActionId } } : {}),
    },
    data: { status: 'CANCELLED' },
  });
  await tx.refreshToken.deleteMany({ where: { userId } });
  await tx.device.deleteMany({ where: { userId } });
  await tx.notification.deleteMany({ where: { userId } });
  await tx.notificationPrefs.deleteMany({ where: { userId } });
  await tx.agentConversation.deleteMany({ where: { userId } });
  await tx.pinReset.deleteMany({ where: { userId } });
  await audit({ action: 'account.deleted', actorUserId: userId, target: `User:${userId}` }, tx);
  effects.add(() => disconnectUser(userId));
}

/** The card that changes the member's own payment number (R13); `origin` AGENT when from chat. */
export async function requestChangePaymentNumber(
  actor: { userId: string; lang: Lang },
  input: { number: string; operator?: 'MTN' | 'ORANGE' },
  origin: ActionOrigin = 'UI',
) {
  return createPendingAction({
    userId: actor.userId,
    groupId: null,
    lang: actor.lang,
    origin,
    type: 'CHANGE_PAYMENT_NUMBER',
    args: normaliseNumber(input.number, input.operator),
  });
}

/** The card that deletes the member's own account (PRV-03). */
export async function requestDeleteAccount(
  actor: { userId: string; lang: Lang },
  origin: ActionOrigin = 'UI',
) {
  return createPendingAction({
    userId: actor.userId,
    groupId: null,
    lang: actor.lang,
    origin,
    type: 'DELETE_ACCOUNT',
    args: {},
  });
}
