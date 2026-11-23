// Closing and hiding a group (D28). A developer's "delete group" never deletes a row: the group
// becomes CLOSED (nothing new can happen in it, `can` refuses every write), it disappears for its
// members, open votes expire through the proposals service and unconfirmed cards are cancelled. The
// ledger is only read, and the votes' closing events are appended to it like any other; rows are
// never changed or removed (CLAUDE.md rule 3), so the hash chain still verifies. Money in flight
// blocks the closing instead of being forced (rule 8).
import { developerErrorTexts as t } from '@njangi/shared/i18n/server/developer';
import { AfterCommit } from '../../lib/after-commit';
import { clock } from '../../lib/clock';
import { defineErrors } from '../../lib/errors';
import { withTransaction, type Db } from '../../lib/prisma';
import { leaveGroupRoom } from '../../realtime/emitter';
import { holdsMoney, moneyHeldBy, type HeldMoney } from '../account';
import { audit } from '../audit';
import { expireOpenProposalsOfGroup } from '../proposals';

export const groupCloseError = defineErrors({
  GROUP_NOT_FOUND: { status: 404, text: t.GROUP_NOT_FOUND },
  GROUP_ALREADY_CLOSED: { status: 409, text: t.GROUP_ALREADY_CLOSED },
  GROUP_MONEY_IN_FLIGHT: { status: 409, text: t.GROUP_MONEY_IN_FLIGHT },
  GROUP_MEMBERS_HOLD_MONEY: { status: 409, text: t.GROUP_MEMBERS_HOLD_MONEY },
});

/**
 * D28 (implementation note): a group is closed only when no member still holds money in it (a debt
 * to pay, a live loan, a non-zero balance), the same test an account deletion uses. The owner has
 * not decided what should happen to such money; this is the conservative default. Set it to false
 * to let a developer close a group whatever its members hold.
 */
export const REFUSE_WHEN_MEMBERS_HOLD_MONEY = true;

/** What the members of a group (every status) still hold in it. */
export async function groupHeldMoney(db: Db, groupId: string): Promise<HeldMoney> {
  const members = await db.membership.findMany({ where: { groupId }, select: { id: true } });
  return moneyHeldBy(
    db,
    members.map((member) => member.id),
  );
}

/** A payment or send not yet final. EXPIRED is included: its status is re-checked before any retry. */
const OPEN_OPERATION = ['CREATED', 'PENDING', 'EXPIRED'] as const;

export interface GroupInFlight {
  openPayments: number;
  openDisbursements: number;
  /** Loans and solidarity payouts approved and not yet sent. */
  approvedPayouts: number;
  openVotes: number;
  /** Cards prepared and not confirmed; they are cancelled on closing. */
  pendingActions: number;
}

/**
 * Confirmed cards that start a payment or a send. A card stays CONFIRMED while the operator is
 * asked, so it counts with the operation it started (and with one whose row is not visible yet).
 */
const PAYMENT_CARD = 'PAY';
const SEND_CARD = 'WITHDRAW';

/** What is still running in a group. Every figure except `pendingActions` blocks a closing. */
export async function groupInFlight(db: Db, groupId: string): Promise<GroupInFlight> {
  const [intents, sends, payCards, sendCards, loans, solidarity, openVotes, pendingActions] =
    await Promise.all([
      db.paymentIntent.count({ where: { groupId, status: { in: [...OPEN_OPERATION] } } }),
      db.disbursement.count({ where: { groupId, status: { in: [...OPEN_OPERATION] } } }),
      db.pendingAction.count({ where: { groupId, status: 'CONFIRMED', type: PAYMENT_CARD } }),
      db.pendingAction.count({ where: { groupId, status: 'CONFIRMED', type: SEND_CARD } }),
      db.loan.count({ where: { groupId, status: 'APPROVED' } }),
      db.solidarityRequest.count({ where: { groupId, status: 'APPROVED', disbursementId: null } }),
      db.proposal.count({ where: { groupId, status: 'OPEN' } }),
      db.pendingAction.count({ where: { groupId, status: 'PENDING' } }),
    ]);
  return {
    openPayments: Math.max(intents, payCards),
    openDisbursements: Math.max(sends, sendCards),
    approvedPayouts: loans + solidarity,
    openVotes,
    pendingActions,
  };
}

/**
 * Only a payment or a send already started blocks (rule 8). Approved loans and payouts are shown
 * as information: nothing was sent, and a closed group never sends them.
 */
export const hasMoneyInFlight = (f: GroupInFlight): boolean =>
  f.openPayments + f.openDisbursements > 0;

export interface CloseGroupResult {
  expiredVotes: number;
  cancelledActions: number;
}

/** Closes and hides the group in one transaction; `developer` is who asked, for the audit entry. */
export async function closeAndHideGroup(
  groupId: string,
  developer: string,
): Promise<CloseGroupResult> {
  const effects = new AfterCommit();
  const result = await withTransaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Group" WHERE "id" = ${groupId}::uuid FOR UPDATE`;
      const group = await tx.group.findUnique({
        where: { id: groupId },
        select: { id: true, status: true, hiddenByDeveloperAt: true },
      });
      if (!group) throw groupCloseError('GROUP_NOT_FOUND');
      if (group.hiddenByDeveloperAt) throw groupCloseError('GROUP_ALREADY_CLOSED');
      const inFlight = await groupInFlight(tx, groupId);
      if (hasMoneyInFlight(inFlight)) {
        throw groupCloseError('GROUP_MONEY_IN_FLIGHT', {
          details: {
            openPayments: inFlight.openPayments,
            openDisbursements: inFlight.openDisbursements,
            approvedPayouts: inFlight.approvedPayouts,
          },
        });
      }
      const now = clock.now();
      const expiredVotes = await expireOpenProposalsOfGroup(tx, groupId, now, effects);
      // After the votes ended (a loan waiting on one is released), and refused as a whole: the
      // transaction rolls back, expired votes and their events included.
      if (REFUSE_WHEN_MEMBERS_HOLD_MONEY) {
        const held = await groupHeldMoney(tx, groupId);
        if (holdsMoney(held)) {
          throw groupCloseError('GROUP_MEMBERS_HOLD_MONEY', {
            details: { ...held },
          });
        }
      }
      // Cards being confirmed right now hold their row; they are skipped, not waited for (that
      // would deadlock with their wait for the group lock) and are refused once this commits.
      const cancelledCards = await tx.$executeRaw`
        UPDATE "PendingAction" SET "status" = 'CANCELLED'
        WHERE "id" IN (
          SELECT "id" FROM "PendingAction"
          WHERE "groupId" = ${groupId}::uuid AND "status" = 'PENDING'
          FOR UPDATE SKIP LOCKED
        )`;
      const cancelled = { count: cancelledCards };
      await tx.group.update({
        where: { id: groupId },
        data: { status: 'CLOSED', hiddenByDeveloperAt: now },
      });
      const members = await tx.membership.findMany({
        where: { groupId },
        select: { userId: true },
      });
      effects.add(() => {
        for (const member of members) leaveGroupRoom(member.userId, groupId);
      });
      await audit(
        {
          action: 'developer.group.closed',
          groupId,
          target: `Group:${groupId}`,
          details: {
            developer,
            previousStatus: group.status,
            expiredVotes,
            cancelledActions: cancelled.count,
          },
        },
        tx,
      );
      return { expiredVotes, cancelledActions: cancelled.count };
    },
    { timeoutMs: 30_000 },
  );
  await effects.run();
  return result;
}
