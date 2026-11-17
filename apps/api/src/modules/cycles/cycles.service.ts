// Cycle and round orchestration (spec 2.9, R1/R2/R3). Calculations stay in @njangi/rules;
// this module only loads state, persists the result, appends ledger events and schedules work.
import {
  cycleStartedEvent,
  genesisHash,
  roundCount,
  roundDates,
  roundObligations,
  type LedgerEvent,
} from '@njangi/rules';
import type { Bilingual } from '@njangi/shared';
import { getPrisma, type Db, type Prisma } from '../../lib/prisma';
import { clock } from '../../lib/clock';
import { getCurrentParams } from '../rulesets';
import { appendLedgerEntry, ledgerHead } from '../ledger';
import { cycleError } from './cycles.errors';

type Tx = Prisma.TransactionClient;

function describe(event: LedgerEvent): Bilingual {
  switch (event.event) {
    case 'CYCLE_STARTED':
      return event.mode === 'FIXED'
        ? {
            fr: `Cycle ${event.cycleNumber} démarré. Ordre du tirage enregistré.`,
            en: `Cycle ${event.cycleNumber} started. Draw order recorded.`,
          }
        : {
            fr: `Cycle ${event.cycleNumber} démarré en mode enchères.`,
            en: `Cycle ${event.cycleNumber} started in bidding mode.`,
          };
    default:
      return { fr: 'Événement enregistré.', en: 'Event recorded.' };
  }
}

async function appendCycleEvent(
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
  const number = 1;
  const head = await ledgerHead(tx, group.id);
  const event = cycleStartedEvent({
    groupId: group.id,
    cycleNumber: number,
    mode: params.rotationMode,
    latestLedgerHash: head?.hash ?? genesisHash(group.id),
    activeMembershipIds: active.map((item) => item.id),
  });
  const now = clock.now();
  const cycle = await tx.cycle.create({
    data: {
      groupId: group.id,
      number,
      mode: params.rotationMode,
      firstPayoutAt: group.firstPayoutAt,
      drawSeed: event.drawSeed,
      rotation: params.rotationMode === 'FIXED' ? event.order : active.map((item) => item.id),
      startedAt: now,
    },
  });
  const count = roundCount(active.length);
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
        firstPayoutAt: group.firstPayoutAt,
        frequency: params.frequency,
        customPeriodMinutes: params.customPeriodMinutes,
        monthlyAnchor: params.payoutTime.monthlyAnchor,
      },
      index,
    );
    const row = await tx.round.create({
      data: {
        groupId: group.id,
        cycleId: cycle.id,
        number: index,
        beneficiaryMembershipId: params.rotationMode === 'FIXED' ? event.order[index - 1]! : null,
        dueAt: dates.dueAt,
        payoutAt: dates.payoutAt,
        status: index === 1 ? 'OPEN' : 'SCHEDULED',
        ruleSetVersion: 1,
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
    activeMembershipIds: active.map((item) => item.id),
  });
  await tx.obligation.createMany({
    data: drafts.map((draft) => ({
      groupId: group.id,
      membershipId: draft.membershipId,
      kind: draft.kind,
      amount: draft.amount,
      dueAt: draft.dueAt,
      roundId: draft.roundId,
      creditorMembershipId: draft.creditorMembershipId,
    })),
  });
  await tx.group.update({
    where: { id: group.id },
    data: { status: 'ACTIVE', currentCycleId: cycle.id },
  });
  await appendCycleEvent(tx, { groupId: group.id, event, occurredAt: now, refId: cycle.id });
  return { cycleNumber: number, firstBeneficiaryMembershipId: event.order[0] ?? null };
}

/** R3.1: opens a scheduled round once, creating one exact obligation per active member. */
export async function openRound(roundId: string, now = clock.now()): Promise<boolean> {
  return getPrisma().$transaction(async (tx) => {
    const round = await tx.round.findUnique({
      where: { id: roundId },
      include: { cycle: { select: { mode: true } } },
    });
    if (!round || round.status !== 'SCHEDULED') return false;
    const previous =
      round.number > 1
        ? await tx.round.findUnique({
            where: { cycleId_number: { cycleId: round.cycleId, number: round.number - 1 } },
            select: { payoutAt: true },
          })
        : null;
    if (round.number > 1 && (!previous || previous.payoutAt > now)) return false;
    const claimed = await tx.round.updateMany({
      where: { id: roundId, status: 'SCHEDULED', dueAt: { lte: now } },
      data: { status: 'OPEN' },
    });
    if (claimed.count !== 1) return false;
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
  const due = await getPrisma().round.findMany({
    where: { status: 'SCHEDULED' },
    select: { id: true },
    orderBy: { dueAt: 'asc' },
    take: 100,
  });
  let opened = 0;
  for (const round of due) if (await openRound(round.id, now)) opened += 1;
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
  await tx.$queryRaw`SELECT "id" FROM "Group" WHERE "id" = ${input.groupId}::uuid FOR UPDATE`;
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
