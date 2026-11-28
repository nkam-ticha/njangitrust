// Starting a cycle after the first (D40.2 to D40.4, GRP-03, R12.1, D18.2): the admin confirms a card
// and chooses the first payout; the order of the previous cycle is kept (not drawn again), members
// added since are included, and loan installments that waited for this cycle get their round.
// Calculations are in @njangi/rules; this file loads state, writes it and records the ledger event.
import {
  canCarryRotation,
  canStartCycle,
  carriedCycleStartedEvent,
  cycleStartedEvent,
  genesisHash,
  nextCycleFirstPayoutAt,
  carryRotation,
  redateOwedInstallments,
  validateNextCycleFirstPayout,
  type CycleStartedEvent,
} from '@njangi/rules';
import { formatDateTime, type Bilingual } from '@njangi/shared';
import { cycleNotificationTexts, cycleSystemTexts } from '@njangi/shared/i18n/server/cycles';
import { AfterCommit, type EffectSink } from '../../lib/after-commit';
import { clock } from '../../lib/clock';
import { getPrisma, type Db, type Prisma } from '../../lib/prisma';
import { bilingual } from '../../lib/texts';
import { audit } from '../audit';
import { postSystemMessage } from '../chat';
import { ledgerHead } from '../ledger';
import { createNotifications } from '../notifications';
import { getCurrentParams, getCurrentRuleSet } from '../rulesets';
import { nextCycleError } from './cycles.errors';
import { launchCycle, startFirstCycle } from './cycles.service';

type Tx = Prisma.TransactionClient;

/** The group's last cycle and whether the group is between cycles (D40.2); null if it is not. */
async function betweenCycles(db: Db, groupId: string) {
  const group = await db.group.findUnique({
    where: { id: groupId },
    select: { status: true, currentCycleId: true },
  });
  if (!group || group.status !== 'ACTIVE' || group.currentCycleId) return null;
  const previous = await db.cycle.findFirst({
    where: { groupId },
    orderBy: { number: 'desc' },
    select: {
      id: true,
      number: true,
      mode: true,
      rotation: true,
      closedAt: true,
      rounds: { select: { payoutAt: true } },
    },
  });
  if (!previous?.closedAt) return null;
  return previous;
}

/**
 * Who takes part in the next cycle: active members, and invited ones whose cycle it is (R12.1).
 * `joinedAt` is when they joined THIS time (D41): a member who left and came back reuses the same
 * membership row, so its `createdAt` is the first join; the latest accepted invite is the real one.
 */
async function participantsOf(db: Db, groupId: string, number: number) {
  const rows = await db.membership.findMany({
    where: {
      groupId,
      OR: [{ status: 'ACTIVE' }, { status: 'INVITED', activeFromCycle: { lte: number } }],
    },
    select: {
      id: true,
      userId: true,
      status: true,
      activeFromCycle: true,
      createdAt: true,
      user: { select: { name: true } },
    },
    orderBy: { id: 'asc' },
  });
  const accepted = await db.invite.findMany({
    where: {
      groupId,
      usedAt: { not: null },
      acceptedByUserId: { in: rows.map((row) => row.userId) },
    },
    select: { acceptedByUserId: true, usedAt: true },
  });
  const latest = new Map<string, Date>();
  for (const invite of accepted) {
    const at = invite.usedAt!;
    const known = latest.get(invite.acceptedByUserId!);
    if (!known || known < at) latest.set(invite.acceptedByUserId!, at);
  }
  return rows.map((row) => {
    const invited = latest.get(row.userId);
    return { ...row, joinedAt: invited && invited > row.createdAt ? invited : row.createdAt };
  });
}

/**
 * M1, D40.3: only members who took part in the previous cycle keep their slot. Someone who left
 * and was invited again reuses the same membership row (their old slot is still in the rotation),
 * but they start from the next cycle, so they are a newcomer: last, by join date.
 */
function continuingOf(
  previous: { number: number; rotation: readonly string[] },
  participants: readonly { id: string; status: string; activeFromCycle: number | null }[],
): { keptOrder: string[]; continuing: Set<string> } {
  const continuing = new Set(
    participants
      .filter((p) => p.status === 'ACTIVE' && (p.activeFromCycle ?? 1) <= previous.number)
      .map((p) => p.id),
  );
  return { continuing, keptOrder: previous.rotation.filter((id) => continuing.has(id)) };
}

const lastPayoutOf = (rounds: readonly { payoutAt: Date }[]): Date =>
  new Date(Math.max(...rounds.map((round) => round.payoutAt.getTime())));

/** The date the card proposes: the earliest the rules accept at the group's payout time. */
export async function suggestedFirstPayoutAt(db: Db, groupId: string, now: Date): Promise<Date> {
  const previous = await betweenCycles(db, groupId);
  if (!previous) throw nextCycleError('NOT_BETWEEN_CYCLES');
  const params = await getCurrentParams(groupId, db);
  try {
    return nextCycleFirstPayoutAt({
      lastPayoutAt: lastPayoutOf(previous.rounds),
      frequency: params.frequency,
      customPeriodMinutes: params.customPeriodMinutes,
      payoutTime: params.payoutTime,
      now,
    });
  } catch (error) {
    // A custom period the schedule cannot use is a refusal the admin can read, not a 500.
    if (error instanceof RangeError) throw nextCycleError('INVALID_CUSTOM_PERIOD');
    throw error;
  }
}

/** What the next cycle will look like (the card and the Caisse screen use it). Reads names only. */
export async function previewNextCycle(db: Db, groupId: string, now: Date) {
  const previous = await betweenCycles(db, groupId);
  if (!previous) throw nextCycleError('NOT_BETWEEN_CYCLES');
  const number = previous.number + 1;
  const params = await getCurrentParams(groupId, db);
  const participants = await participantsOf(db, groupId, number);
  const carry =
    params.rotationMode === 'FIXED' &&
    canCarryRotation({ previousMode: previous.mode, previousOrder: previous.rotation });
  const { continuing: kept, keptOrder } = continuingOf(previous, participants);
  const order = carry
    ? carryRotation({
        previousOrder: keptOrder,
        participants: participants.map((p) => ({ membershipId: p.id, joinedAt: p.joinedAt })),
      })
    : [];
  const byId = new Map(participants.map((p) => [p.id, p]));
  return {
    number,
    participantCount: participants.length,
    newcomerCount: carry
      ? participants.filter((p) => !kept.has(p.id)).length
      : participants.filter((p) => p.status === 'INVITED').length,
    orderKind:
      params.rotationMode === 'BIDDING'
        ? ('BIDDING' as const)
        : carry
          ? ('KEPT' as const)
          : ('DRAWN' as const),
    order: order.map((id) => ({
      membershipId: id,
      name: byId.get(id)!.user.name,
      newcomer: !kept.has(id),
    })),
    suggestedFirstPayoutAt: await suggestedFirstPayoutAt(db, groupId, now),
  };
}

/**
 * Read-only check of a chosen (or the suggested) first payout, for the START_CYCLE card's
 * `prepare` (CLAUDE.md rule 5: it changes nothing; `startNextCycle` repeats this under the group
 * lock when the card is confirmed). Throws `nextCycleError` on refusal.
 */
export async function checkNextCycleFirstPayout(
  db: Db,
  groupId: string,
  firstPayoutAt: Date,
  now: Date,
): Promise<void> {
  const previous = await betweenCycles(db, groupId);
  if (!previous) throw nextCycleError('NOT_BETWEEN_CYCLES');
  const params = await getCurrentParams(groupId, db);
  const valid = validateNextCycleFirstPayout({
    firstPayoutAt,
    previousLastPayoutAt: lastPayoutOf(previous.rounds),
    now,
    frequency: params.frequency,
    customPeriodMinutes: params.customPeriodMinutes,
    monthlyAnchor: params.payoutTime.monthlyAnchor,
  });
  if (!valid.ok) throw nextCycleError(valid.code);
}

/**
 * D40.2: starts cycle `n + 1`. Called inside the START_CYCLE confirmation (one transaction); the
 * group is locked first so a vote or a second confirmation cannot interleave.
 */
export async function startNextCycle(
  tx: Tx,
  input: { groupId: string; startedByUserId: string; firstPayoutAt: Date },
  effects: EffectSink,
): Promise<{ cycleNumber: number; firstBeneficiaryMembershipId: string | null }> {
  const { groupId } = input;
  await tx.$queryRaw`SELECT "id" FROM "Group" WHERE "id" = ${groupId}::uuid FOR UPDATE`;
  const previous = await betweenCycles(tx, groupId);
  if (!previous) throw nextCycleError('NOT_BETWEEN_CYCLES');
  const now = clock.now();
  const number = previous.number + 1;
  const participants = await participantsOf(tx, groupId, number);
  const allowed = canStartCycle(participants.length);
  if (!allowed.ok) {
    throw nextCycleError(allowed.code, { params: { count: participants.length } });
  }
  const params = await getCurrentParams(groupId, tx);
  const ruleSet = await getCurrentRuleSet(groupId, tx);

  const valid = validateNextCycleFirstPayout({
    firstPayoutAt: input.firstPayoutAt,
    previousLastPayoutAt: lastPayoutOf(previous.rounds),
    now,
    frequency: params.frequency,
    customPeriodMinutes: params.customPeriodMinutes,
    monthlyAnchor: params.payoutTime.monthlyAnchor,
  });
  if (!valid.ok) throw nextCycleError(valid.code);

  // Newcomers become active members now (R12.1).
  const joining = participants.filter((p) => p.status === 'INVITED');
  if (joining.length > 0) {
    await tx.membership.updateMany({
      where: { id: { in: joining.map((p) => p.id) }, status: 'INVITED' },
      data: { status: 'ACTIVE' },
    });
  }

  // The order (D40.3): kept after a fixed cycle, drawn otherwise (Q1), none in bidding mode.
  const ids = participants.map((p) => p.id);
  const head = await ledgerHead(tx, groupId);
  const latestLedgerHash = head?.hash ?? genesisHash(groupId);
  const carry =
    params.rotationMode === 'FIXED' &&
    canCarryRotation({ previousMode: previous.mode, previousOrder: previous.rotation });
  let event: CycleStartedEvent;
  if (carry) {
    const { continuing, keptOrder } = continuingOf(previous, participants);
    const order = carryRotation({
      previousOrder: keptOrder,
      participants: participants.map((p) => ({ membershipId: p.id, joinedAt: p.joinedAt })),
    });
    event = carriedCycleStartedEvent({
      cycleNumber: number,
      latestLedgerHash,
      activeMembershipIds: ids,
      order,
      // L7: the verifier checks the newcomers' order (join date, then id) from these dates.
      newcomerJoinedAt: Object.fromEntries(
        participants
          .filter((p) => !continuing.has(p.id))
          .map((p) => [p.id, p.joinedAt.toISOString()]),
      ),
    });
  } else {
    event = cycleStartedEvent({
      groupId,
      cycleNumber: number,
      mode: params.rotationMode,
      latestLedgerHash,
      activeMembershipIds: ids,
    });
  }
  const launched = await launchCycle(tx, {
    groupId,
    number,
    mode: params.rotationMode,
    params,
    ruleSetVersion: ruleSet.version,
    firstPayoutAt: input.firstPayoutAt,
    order: params.rotationMode === 'FIXED' ? event.order : ids,
    participantIds: ids,
    event,
    now,
  });

  await redateWaitingInstallments(tx, groupId, params.frequency, launched.rounds);

  // The group is told: who is active from now, and the order.
  const names = new Map(participants.map((p) => [p.id, p.user.name]));
  for (const p of joining) {
    await postSystemMessage(
      groupId,
      bilingual(cycleSystemTexts.memberActive, { name: p.user.name, cycle: number }),
      effects,
      tx,
    );
  }
  const orderText = event.order.map((id, i) => `${i + 1}. ${names.get(id)}`).join(', ');
  const posted: Bilingual =
    params.rotationMode === 'BIDDING'
      ? bilingual(cycleSystemTexts.startedBidding, { cycle: number })
      : bilingual(carry ? cycleSystemTexts.startedKept : cycleSystemTexts.startedDrawn, {
          cycle: number,
          order: orderText,
        });
  await postSystemMessage(groupId, posted, effects, tx);
  const date = {
    fr: formatDateTime(input.firstPayoutAt, 'fr'),
    en: formatDateTime(input.firstPayoutAt, 'en'),
  };
  await createNotifications(
    participants.map((p) => ({
      userId: p.userId,
      groupId,
      category: 'GROUP' as const,
      title: bilingual(cycleNotificationTexts.startedTitle, { cycle: number }),
      body: bilingual(cycleNotificationTexts.startedBody, { date }),
      deepLink: '/caisse',
    })),
    effects,
    tx,
  );
  await audit(
    {
      action: 'cycle.started',
      actorUserId: input.startedByUserId,
      groupId,
      target: `Group:${groupId}`,
      details: { cycle: number, order: carry ? 'KEPT' : params.rotationMode },
    },
    tx,
  );
  return { cycleNumber: number, firstBeneficiaryMembershipId: event.order[0] ?? null };
}

/**
 * D18.2: loan installments that waited for the next cycle ("due at a round of the next cycle")
 * take the corresponding round of the cycle that just started.
 */
async function redateWaitingInstallments(
  tx: Tx,
  groupId: string,
  frequency: Parameters<typeof redateOwedInstallments>[0]['frequency'],
  rounds: readonly { id: string; dueAt: Date; payoutAt: Date }[],
): Promise<void> {
  const loans = await tx.loan.findMany({
    where: {
      groupId,
      status: { in: ['DISBURSED', 'OVERDUE'] },
      obligations: { some: { kind: 'LOAN_INSTALLMENT', status: 'DUE', roundId: null } },
    },
    select: {
      id: true,
      createdAt: true,
      decidedAt: true,
      obligations: {
        where: { kind: 'LOAN_INSTALLMENT', status: { not: 'CANCELLED' } },
        select: { id: true, dueAt: true, roundId: true, status: true },
      },
    },
  });
  for (const loan of loans) {
    const dated = redateOwedInstallments({
      frequency,
      approvedAt: loan.decidedAt ?? loan.createdAt,
      installments: loan.obligations.map((o) => ({
        id: o.id,
        dueAt: o.dueAt,
        // M2: in a round or not, and paid early or not: a paid-early installment still holds its
        // place in the count, it is just not moved.
        dated: o.roundId !== null,
        settled: o.status !== 'DUE',
      })),
      rounds,
    });
    for (const item of dated) {
      if (item.due.status !== 'DATED') continue;
      const dueAt = item.due.dueAt;
      const round = rounds.find((r) => r.dueAt.getTime() === dueAt.getTime());
      await tx.obligation.update({
        where: { id: item.id },
        data: { dueAt, roundId: round?.id ?? null },
      });
    }
  }
}

/** The one door for START_CYCLE: the first cycle (group FORMING) or a later one (between cycles). */
export async function startCycle(
  tx: Tx,
  input: { groupId: string; startedByUserId: string; firstPayoutAt?: Date },
  effects: EffectSink = new AfterCommit(),
): Promise<{ cycleNumber: number; firstBeneficiaryMembershipId: string | null }> {
  const group = await tx.group.findUnique({
    where: { id: input.groupId },
    select: { status: true },
  });
  if (group?.status === 'FORMING') return startFirstCycle(tx, input);
  const firstPayoutAt =
    input.firstPayoutAt ?? (await suggestedFirstPayoutAt(tx, input.groupId, clock.now()));
  return startNextCycle(tx, { ...input, firstPayoutAt }, effects);
}

/**
 * START_CYCLE args, normalised before the card exists (the card must not depend on the clock):
 * nothing but the group for the first cycle; for a later one, the date the admin chose, or the
 * suggested one when none was given (the agent and the plain "start" button).
 */
export async function normalizeStartCycleArgs(
  groupId: string,
  firstPayoutAt?: string,
): Promise<{ groupId: string; firstPayoutAt?: string }> {
  const db = getPrisma();
  const group = await db.group.findUnique({ where: { id: groupId }, select: { status: true } });
  if (!group || group.status === 'FORMING') return { groupId };
  if (firstPayoutAt) return { groupId, firstPayoutAt };
  const suggested = await suggestedFirstPayoutAt(db, groupId, clock.now());
  return { groupId, firstPayoutAt: suggested.toISOString() };
}
