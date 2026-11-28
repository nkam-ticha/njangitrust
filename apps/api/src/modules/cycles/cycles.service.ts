// Cycle and round orchestration (spec 2.9, R1/R2/R3). Calculations stay in @njangi/rules;
// this module only loads state, persists the result, appends ledger events and schedules work.
import {
  cycleStartedEvent,
  genesisHash,
  roundCount,
  roundDates,
  roundObligations,
  type CycleStartedEvent,
  type LedgerEvent,
  type RuleSetParams,
  type RotationMode,
} from '@njangi/rules';
import type { Bilingual } from '@njangi/shared';
import { getPrisma, type Db, type Prisma } from '../../lib/prisma';
import { clock } from '../../lib/clock';
import { componentLogger } from '../../lib/logger';
import { getCurrentParams, getCurrentRuleSet } from '../rulesets';
import { appendLedgerEntry, ledgerHead } from '../ledger';
import { cycleError } from './cycles.errors';
import { lockRoundsThenGroup } from './cycles.locks';

type Tx = Prisma.TransactionClient;

function describe(event: LedgerEvent): Bilingual {
  switch (event.event) {
    case 'CYCLE_STARTED':
      if (event.orderSource === 'CARRIED') {
        return {
          fr: `Cycle ${event.cycleNumber} démarré. Ordre conservé du cycle précédent.`,
          en: `Cycle ${event.cycleNumber} started. Order kept from the previous cycle.`,
        };
      }
      return event.mode === 'FIXED'
        ? {
            fr: `Cycle ${event.cycleNumber} démarré. Ordre du tirage enregistré.`,
            en: `Cycle ${event.cycleNumber} started. Draw order recorded.`,
          }
        : {
            fr: `Cycle ${event.cycleNumber} démarré en mode enchères.`,
            en: `Cycle ${event.cycleNumber} started in bidding mode.`,
          };
    case 'CYCLE_CLOSED':
      return {
        fr: `Cycle ${event.cycleNumber} terminé.`,
        en: `Cycle ${event.cycleNumber} ended.`,
      };
    default:
      return { fr: 'Événement enregistré.', en: 'Event recorded.' };
  }
}

export async function appendCycleEvent(
  tx: Tx,
  input: {
    groupId: string;
    event: LedgerEvent;
    occurredAt: Date;
    refId: string;
  },
) {
  await appendLedgerEntry(tx, input.groupId, {
    type: 'EVENT',
    occurredAt: input.occurredAt.toISOString(),
    roundId: null,
    membershipId: null,
    refType: 'Cycle',
    refId: input.refId,
    ...(() => {
      const text = describe(input.event);
      return { descriptionFr: text.fr, descriptionEn: text.en };
    })(),
    metadata: input.event,
    postings: [],
  });
}

/**
 * Creates a cycle with all its rounds and opens round 1 (R2.1, R2.2, R3.1): shared by the first
 * cycle (drawn order) and every later one (kept order, D40). The caller has locked the group and
 * checked who takes part; `order` is the rotation (the drawn or kept order; the participants in
 * bidding mode) and `participantIds` owe round 1.
 */
export async function launchCycle(
  tx: Tx,
  input: {
    groupId: string;
    number: number;
    mode: RotationMode;
    params: RuleSetParams;
    ruleSetVersion: number;
    firstPayoutAt: Date;
    order: readonly string[];
    participantIds: readonly string[];
    event: CycleStartedEvent;
    now: Date;
  },
): Promise<{
  cycleId: string;
  rounds: { id: string; number: number; payoutAt: Date; dueAt: Date }[];
}> {
  const { params } = input;
  const cycle = await tx.cycle.create({
    data: {
      groupId: input.groupId,
      number: input.number,
      mode: input.mode,
      firstPayoutAt: input.firstPayoutAt,
      drawSeed: input.event.drawSeed,
      rotation: [...input.order],
      startedAt: input.now,
    },
  });
  const count = roundCount(input.participantIds.length);
  const rounds = [] as {
    id: string;
    number: number;
    payoutAt: Date;
    dueAt: Date;
    beneficiaryMembershipId: string | null;
  }[];
  for (let index = 1; index <= count; index += 1) {
    const dates = roundDates(
      {
        firstPayoutAt: input.firstPayoutAt,
        frequency: params.frequency,
        customPeriodMinutes: params.customPeriodMinutes,
        monthlyAnchor: params.payoutTime.monthlyAnchor,
      },
      index,
    );
    const row = await tx.round.create({
      data: {
        groupId: input.groupId,
        cycleId: cycle.id,
        number: index,
        beneficiaryMembershipId: input.mode === 'FIXED' ? input.order[index - 1]! : null,
        dueAt: dates.dueAt,
        payoutAt: dates.payoutAt,
        status: index === 1 ? 'OPEN' : 'SCHEDULED',
        ruleSetVersion: input.ruleSetVersion,
      },
      select: {
        id: true,
        number: true,
        payoutAt: true,
        dueAt: true,
        beneficiaryMembershipId: true,
      },
    });
    rounds.push(row);
  }
  const first = rounds[0]!;
  const drafts = roundObligations({
    contributionAmount: params.contributionAmount,
    solidarityContribution: params.solidarityContribution,
    round: {
      id: first.id,
      dueAt: first.dueAt,
      beneficiaryMembershipId: first.beneficiaryMembershipId,
    },
    activeMembershipIds: [...input.participantIds],
  });
  await tx.obligation.createMany({
    data: drafts.map((draft) => ({
      groupId: input.groupId,
      membershipId: draft.membershipId,
      kind: draft.kind,
      amount: draft.amount,
      dueAt: draft.dueAt,
      roundId: draft.roundId,
      creditorMembershipId: draft.creditorMembershipId,
    })),
  });
  await tx.group.update({
    where: { id: input.groupId },
    data: { status: 'ACTIVE', currentCycleId: cycle.id },
  });
  await appendCycleEvent(tx, {
    groupId: input.groupId,
    event: input.event,
    occurredAt: input.now,
    refId: cycle.id,
  });
  return { cycleId: cycle.id, rounds };
}

/** R1.1, R2.1/R2.3, GRP-02/03: start the first cycle and open round 1 atomically. */
export async function startFirstCycle(
  tx: Tx,
  input: { groupId: string; startedByUserId: string },
): Promise<{ cycleNumber: number; firstBeneficiaryMembershipId: string | null }> {
  const group = await tx.group.findUnique({
    where: { id: input.groupId },
    select: { id: true, status: true, firstPayoutAt: true, currentCycleId: true },
  });
  if (!group || group.status !== 'FORMING' || group.currentCycleId)
    throw cycleError('CYCLE_ALREADY_STARTED');
  const active = await tx.membership.findMany({
    where: { groupId: group.id, status: 'ACTIVE' },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  if (active.length < 3 || active.length > 50) throw cycleError('CYCLE_START_UNAVAILABLE');
  const params = await getCurrentParams(group.id, tx);
  const ruleSet = await getCurrentRuleSet(group.id, tx);
  const number = 1;
  const head = await ledgerHead(tx, group.id);
  const event = cycleStartedEvent({
    groupId: group.id,
    cycleNumber: number,
    mode: params.rotationMode,
    latestLedgerHash: head?.hash ?? genesisHash(group.id),
    activeMembershipIds: active.map((item) => item.id),
  });
  await launchCycle(tx, {
    groupId: group.id,
    number,
    mode: params.rotationMode,
    params,
    ruleSetVersion: ruleSet.version,
    firstPayoutAt: group.firstPayoutAt,
    order: params.rotationMode === 'FIXED' ? event.order : active.map((item) => item.id),
    participantIds: active.map((item) => item.id),
    event,
    now: clock.now(),
  });
  return { cycleNumber: number, firstBeneficiaryMembershipId: event.order[0] ?? null };
}

/** R3.1: opens a scheduled round once, creating one exact obligation per active member. */
export async function openRound(roundId: string, now = clock.now()): Promise<boolean> {
  return getPrisma().$transaction(async (tx) => {
    // The shared lock order (rounds, then the group) and only then the round is read (M3): a
    // rotation change in flight has committed, so the beneficiary read here is the final one.
    const found = await tx.round.findUnique({ where: { id: roundId }, select: { groupId: true } });
    if (!found) return false;
    await lockRoundsThenGroup(tx, found.groupId);
    const round = await tx.round.findUnique({
      where: { id: roundId },
      include: { cycle: { select: { mode: true } } },
    });
    if (!round || round.status !== 'SCHEDULED') return false;
    const previous =
      round.number > 1
        ? await tx.round.findUnique({
            where: { cycleId_number: { cycleId: round.cycleId, number: round.number - 1 } },
            select: { payoutAt: true, status: true },
          })
        : null;
    // M4: the previous round must have paid out (its payout opened), not only reached its time;
    // otherwise it would stay stuck in PAYOUT behind a round that is already open. The scan retries.
    if (
      round.number > 1 &&
      (!previous ||
        previous.payoutAt > now ||
        (previous.status !== 'PAYOUT' && previous.status !== 'CLOSED'))
    )
      return false;
    const claimed = await tx.round.updateMany({
      // Opens once the previous payout is done (checked above), not at its own deadline: members
      // pay between the two.
      where: { id: roundId, status: 'SCHEDULED' },
      data: { status: 'OPEN' },
    });
    if (claimed.count !== 1) return false;
    // The previous round's payout is done, so it is closed (money still owed on it stays owed, R3.4).
    await tx.round.updateMany({
      where: { cycleId: round.cycleId, number: round.number - 1, status: 'PAYOUT' },
      data: { status: 'CLOSED' },
    });
    const params = await getCurrentParams(round.groupId, tx);
    const members = await tx.membership.findMany({
      where: { groupId: round.groupId, status: { in: ['ACTIVE', 'LEAVING'] } },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    const drafts = roundObligations({
      contributionAmount: params.contributionAmount,
      solidarityContribution: params.solidarityContribution,
      round: {
        id: round.id,
        dueAt: round.dueAt,
        beneficiaryMembershipId: round.beneficiaryMembershipId,
      },
      activeMembershipIds: members.map((member) => member.id),
    });
    await tx.obligation.createMany({
      data: drafts.map((draft) => ({
        groupId: round.groupId,
        membershipId: draft.membershipId,
        kind: draft.kind,
        amount: draft.amount,
        dueAt: draft.dueAt,
        roundId: draft.roundId,
        creditorMembershipId: draft.creditorMembershipId,
      })),
      skipDuplicates: true,
    });
    return true;
  });
}

export async function openDueRounds(now = clock.now()): Promise<number> {
  // Only rounds that can open now: their previous round has paid out (PAYOUT or CLOSED) and its
  // payout time has passed (the same test as openRound), so rounds still waiting for a payout can
  // never fill the batch and hold up the other groups. D28: a closed group takes no new activity.
  const due = await getPrisma().$queryRaw<{ id: string }[]>`
    SELECT r."id" FROM "Round" r
    LEFT JOIN "Round" p ON p."cycleId" = r."cycleId" AND p."number" = r."number" - 1
    JOIN "Group" g ON g."id" = r."groupId"
    WHERE r."status" = 'SCHEDULED'
      AND (
        r."number" = 1
        OR (p."status" IN ('PAYOUT', 'CLOSED') AND p."payoutAt" <= ${now})
      )
      AND g."status" <> 'CLOSED'
    ORDER BY r."dueAt" ASC
    LIMIT 100`;
  let opened = 0;
  for (const round of due) {
    try {
      if (await openRound(round.id, now)) opened += 1;
    } catch (error) {
      // One round's failure never stops the others; the next scan retries it.
      componentLogger('cycles').error({ err: error, roundId: round.id }, 'opening a round failed');
    }
  }
  return opened;
}

/** The group's current cycle rotation and the round in progress (0 before round 1), or null. */
export async function currentRotation(db: Db, groupId: string) {
  const group = await db.group.findUnique({
    where: { id: groupId },
    select: { currentCycleId: true },
  });
  if (!group?.currentCycleId) return null;
  const cycle = await db.cycle.findUniqueOrThrow({
    where: { id: group.currentCycleId },
    select: {
      id: true,
      number: true,
      rotation: true,
      rounds: { where: { status: { not: 'SCHEDULED' } }, select: { number: true } },
    },
  });
  return {
    cycleId: cycle.id,
    cycleNumber: cycle.number,
    rotation: cycle.rotation,
    currentRound: cycle.rounds.reduce((latest, round) => Math.max(latest, round.number), 0),
  };
}

/**
 * R2.4: a voted rotation change applies from the next round. Rounds already opened keep their
 * beneficiary; each round still scheduled takes the member at its position in the new order.
 */
export async function applyRotationChange(
  tx: Tx,
  input: { groupId: string; newOrder: string[]; proposalId: string },
): Promise<void> {
  await lockRoundsThenGroup(tx, input.groupId);
  const current = await currentRotation(tx, input.groupId);
  if (!current) throw cycleError('CYCLE_START_UNAVAILABLE');
  const cycle = await tx.cycle.findUniqueOrThrow({
    where: { id: current.cycleId },
    select: { mode: true, rounds: { select: { id: true, number: true, status: true } } },
  });
  const same =
    input.newOrder.length === current.rotation.length &&
    [...input.newOrder].sort().join() === [...current.rotation].sort().join();
  const servedKept = current.rotation
    .slice(0, current.currentRound)
    .every((id, index) => input.newOrder[index] === id);
  if (cycle.mode !== 'FIXED' || !same || !servedKept) throw cycleError('CYCLE_START_UNAVAILABLE');
  await tx.cycle.update({ where: { id: current.cycleId }, data: { rotation: input.newOrder } });
  for (const round of cycle.rounds) {
    if (round.status !== 'SCHEDULED') continue;
    await tx.round.update({
      where: { id: round.id },
      data: { beneficiaryMembershipId: input.newOrder[round.number - 1]! },
    });
  }
}
