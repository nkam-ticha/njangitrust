// Who may confirm a PIN reset (spec 2.10, D8): the admin of a group the member belongs to; when
// the member is that group's admin, two other active members of the group, each confirming.
import { clock } from '../../lib/clock';
import { getPrisma, type Db } from '../../lib/prisma';
import { authorizeGroup } from '../../permissions';
import { authError } from './auth.errors';

const READABLE = ['INVITED', 'ACTIVE', 'LEAVING'] as const;

export interface ReviewState {
  pinResetId: string;
  requesterUserId: string;
  requesterName: string;
  requesterMembershipId: string;
  requestedAt: Date;
  requestExpiresAt: Date;
  reviewerMembershipId: string;
  /** 1 for a member (the admin confirms), 2 for the admin (D8). */
  needed: number;
  given: number;
  confirmedByMe: boolean;
}

/** Confirmations still needed after this reviewer, and whether they may confirm at all. */
export async function loadReview(
  reviewerUserId: string,
  groupId: string,
  pinResetId: string,
  db: Db = getPrisma(),
): Promise<ReviewState> {
  const access = await authorizeGroup(reviewerUserId, groupId, 'group.pinResets.review', db);
  const reset = await db.pinReset.findUnique({
    where: { id: pinResetId },
    select: {
      id: true,
      userId: true,
      status: true,
      createdAt: true,
      requestExpiresAt: true,
      user: { select: { name: true } },
      approvals: { where: { groupId }, select: { membershipId: true } },
    },
  });
  if (!reset || reset.status !== 'REQUESTED' || reset.requestExpiresAt <= clock.now()) {
    throw authError('PIN_RESET_NOT_FOUND');
  }
  const requester = await db.membership.findUnique({
    where: { groupId_userId: { groupId, userId: reset.userId } },
    select: { id: true, role: true, status: true },
  });
  if (!requester || !(READABLE as readonly string[]).includes(requester.status)) {
    throw authError('PIN_RESET_NOT_FOUND');
  }
  const requesterIsAdmin = requester.role === 'ADMIN';
  if (reset.userId === reviewerUserId) throw authError('PIN_RESET_NOT_ALLOWED');
  if (!requesterIsAdmin && access.membership.role !== 'ADMIN') throw authError('PIN_RESET_NOT_ALLOWED');
  return {
    pinResetId: reset.id,
    requesterUserId: reset.userId,
    requesterName: reset.user.name,
    requesterMembershipId: requester.id,
    requestedAt: reset.createdAt,
    requestExpiresAt: reset.requestExpiresAt,
    reviewerMembershipId: access.membership.id,
    needed: requesterIsAdmin ? 2 : 1,
    given: reset.approvals.length,
    confirmedByMe: reset.approvals.some((a) => a.membershipId === access.membership.id),
  };
}

/** Open requests in a group that the viewer may confirm. */
export async function listReviewable(reviewerUserId: string, groupId: string): Promise<ReviewState[]> {
  await authorizeGroup(reviewerUserId, groupId, 'group.pinResets.review');
  const open = await getPrisma().pinReset.findMany({
    where: {
      status: 'REQUESTED',
      requestExpiresAt: { gt: clock.now() },
      userId: { not: reviewerUserId },
      user: { memberships: { some: { groupId, status: { in: [...READABLE] } } } },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  const states: ReviewState[] = [];
  for (const { id } of open) {
    try {
      states.push(await loadReview(reviewerUserId, groupId, id));
    } catch {
      // Not this viewer's to confirm (a member's request is for the admin only).
    }
  }
  return states;
}
