import {
  bidWinner,
  completeRuleSet,
  biddingEligible,
  validateBid,
  validateRuleSet,
} from '@njangi/rules';
import { formatDateTime } from '@njangi/shared';
import { clock } from '../../lib/clock';
import { getPrisma, type Db } from '../../lib/prisma';
import { authorizeGroup, type AuthActor } from '../../permissions';
import { createPendingAction, type ActionOrigin } from '../pending-actions';
import { bidError } from './bids.errors';

async function bidContext(db: Db, groupId: string, roundId: string, userId: string) {
  const round = await db.round.findFirst({
    where: { id: roundId, groupId },
    include: {
      cycle: {
        select: {
          number: true,
          mode: true,
          rotation: true,
          rounds: {
            orderBy: { number: 'asc' },
            select: { id: true, number: true, beneficiaryMembershipId: true },
          },
        },
      },
    },
  });
  if (!round) throw bidError('ROUND_NOT_FOUND');
  const ruleSet = await db.ruleSet.findFirstOrThrow({
    where: { groupId, version: round.ruleSetVersion },
  });
  const params = completeRuleSet(ruleSet.params);
  const valid = validateRuleSet(params);
  if (!valid.ok) throw new Error(`Invalid rule set ${round.ruleSetVersion}: ${valid.code}`);
  const access = await authorizeGroup(userId, groupId, 'group.bids.place', db);
  const previous = round.cycle.rounds.filter((r) => r.number < round.number);
  const eligible = biddingEligible({
    activeMembershipIds: round.cycle.rotation,
    servedMembershipIds: previous.flatMap((r) =>
      r.beneficiaryMembershipId ? [r.beneficiaryMembershipId] : [],
    ),
  });
  const current = await db.bid.findUnique({
    where: { roundId_membershipId: { roundId, membershipId: access.membership.id } },
  });
  return { round, params, access, eligible, current };
}

export async function prepareBid(
  userId: string,
  groupId: string,
  roundId: string,
  amount: number,
  now: Date = clock.now(),
  db: Db = getPrisma(),
) {
  const context = await bidContext(db, groupId, roundId, userId);
  const check = validateBid({
    rotationMode: context.params.rotationMode,
    membershipId: context.access.membership.id,
    eligibleMembershipIds: context.eligible,
    amount,
    minBid: context.params.minBid,
    currentBid: context.current ? { amount: context.current.amount } : null,
    now,
    closesAt: context.round.dueAt,
  });
  if (!check.ok) throw bidError('BID_NOT_AVAILABLE');
  return { ...context, action: check.action, amount };
}

export async function placeBid(
  actor: AuthActor,
  groupId: string,
  roundId: string,
  amount: number,
  origin: ActionOrigin = 'UI',
) {
  return createPendingAction({
    userId: actor.userId,
    groupId,
    lang: actor.lang,
    origin,
    type: 'PLACE_BID',
    args: { groupId, roundId, amount },
  });
}

/** R8.6: before close expose only the caller's bid and the count; after close publish all bids. */
export async function readBids(
  userId: string,
  groupId: string,
  roundId: string,
  now: Date = clock.now(),
) {
  const access = await authorizeGroup(userId, groupId, 'group.bids.read');
  const round = await getPrisma().round.findFirst({
    where: { id: roundId, groupId },
    select: { id: true, number: true, dueAt: true, beneficiaryMembershipId: true },
  });
  if (!round) throw bidError('ROUND_NOT_FOUND');
  const [count, mine] = await Promise.all([
    getPrisma().bid.count({ where: { roundId } }),
    getPrisma().bid.findUnique({
      where: { roundId_membershipId: { roundId, membershipId: access.membership.id } },
      select: { amount: true, placedAt: true, updatedAt: true },
    }),
  ]);
  const closesAt = { fr: formatDateTime(round.dueAt, 'fr'), en: formatDateTime(round.dueAt, 'en') };
  if (now < round.dueAt) return { round: round.number, closesAt, count, mine, bids: null };
  const bids = await getPrisma().bid.findMany({
    where: { roundId },
    orderBy: [{ amount: 'desc' }, { updatedAt: 'asc' }],
    include: { membership: { select: { id: true, user: { select: { name: true } } } } },
  });
  const winner = bidWinner(
    bids.map((b) => ({ membershipId: b.membershipId, amount: b.amount, reachedAt: b.updatedAt })),
  );
  return {
    round: round.number,
    closesAt,
    count,
    mine,
    winnerMembershipId: winner?.membershipId ?? null,
    bids: bids.map((b) => ({
      membershipId: b.membershipId,
      name: b.membership.user.name,
      amount: b.amount,
      reachedAt: b.updatedAt,
    })),
  };
}
