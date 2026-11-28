// Closing a cycle (R9.3, R9.4, R12.2, D40.1): at the last round's payout, the general fund is shared,
// members who announced leaving go, rounds close and the group waits for the admin to start the next
// cycle. Calculations are `planCycleClose` in @njangi/rules; this file loads the figures, writes the
// ledger entry and the changes in ONE transaction under the group lock, and claims `Cycle.closedAt`
// first so a second run (a retry, a second scheduler) does nothing.
import {
  availableForLoans,
  computeBalances,
  cycleClosedEvent,
  fundDistributionPostings,
  planCycleClose,
  summarizeBalances,
  type CycleCloseMember,
} from '@njangi/rules';
import { formatXAF, type Bilingual } from '@njangi/shared';
import { cycleNotificationTexts, cycleSystemTexts } from '@njangi/shared/i18n/server/cycles';
import { AfterCommit } from '../../lib/after-commit';
import { clock } from '../../lib/clock';
import { componentLogger } from '../../lib/logger';
import { getPrisma, withTransaction, type Prisma } from '../../lib/prisma';
import { bilingual } from '../../lib/texts';
import { audit } from '../audit';
import { postSystemMessage } from '../chat';
import { appendLedgerEntry } from '../ledger';
import { createNotifications, type NotificationInput } from '../notifications';
import { getCurrentParams } from '../rulesets';
import { readChain } from '../statements/ledger-read';
import { lockRoundsThenGroup } from './cycles.locks';
import { appendCycleEvent } from './cycles.service';
import { endLeavingMember } from './cycles.leaving';

type Tx = Prisma.TransactionClient;

const log = componentLogger('cycles');

const money = (amount: number): Bilingual => ({
  fr: formatXAF(amount, 'fr'),
  en: formatXAF(amount, 'en'),
});

/**
 * D40.1: closes the cycle if it is due: not closed yet, every round past opening (PAYOUT or CLOSED)
 * and the last payout time reached. Returns whether this call closed it. Idempotent and safe to run
 * from several places at once.
 */
export async function closeCycle(cycleId: string, now: Date = clock.now()): Promise<boolean> {
  const effects = new AfterCommit();
  const closed = await withTransaction(async (tx) => {
    const found = await tx.cycle.findUnique({
      where: { id: cycleId },
      select: { groupId: true },
    });
    if (!found) return false;
    await lockRoundsThenGroup(tx, found.groupId);
    const cycle = await tx.cycle.findUnique({
      where: { id: cycleId },
      select: {
        id: true,
        groupId: true,
        number: true,
        mode: true,
        rotation: true,
        closedAt: true,
        group: { select: { status: true } },
        rounds: { select: { id: true, status: true, payoutAt: true } },
      },
    });
    if (!cycle || cycle.closedAt || cycle.group.status === 'CLOSED') return false;
    const due =
      cycle.rounds.length > 0 &&
      cycle.rounds.every((round) => round.status === 'PAYOUT' || round.status === 'CLOSED') &&
      Math.max(...cycle.rounds.map((round) => round.payoutAt.getTime())) <= now.getTime();
    if (!due) return false;
    const claimed = await tx.cycle.updateMany({
      where: { id: cycle.id, closedAt: null },
      data: { closedAt: now },
    });
    if (claimed.count !== 1) return false;
    await settleClose(tx, { ...cycle, now }, effects);
    return true;
  });
  if (closed) await effects.run();
  return closed;
}

/** The scan: closes every cycle that is due. Returns how many it closed. */
export async function closeDueCycles(now: Date = clock.now()): Promise<number> {
  const open = await getPrisma().cycle.findMany({
    where: {
      closedAt: null,
      group: { status: 'ACTIVE' },
      rounds: { none: { status: { in: ['SCHEDULED', 'OPEN'] } } },
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
  let closed = 0;
  for (const cycle of open) {
    try {
      if (await closeCycle(cycle.id, now)) closed += 1;
    } catch (error) {
      // One group's failure never stops the others; the next scan retries it.
      log.error({ err: error, cycleId: cycle.id }, 'closing a cycle failed; will retry');
    }
  }
  return closed;
}

async function settleClose(
  tx: Tx,
  cycle: {
    id: string;
    groupId: string;
    number: number;
    mode: 'FIXED' | 'BIDDING';
    rotation: string[];
    rounds: { id: string }[];
    now: Date;
  },
  effects: AfterCommit,
): Promise<void> {
  const { groupId, now } = cycle;
  const params = await getCurrentParams(groupId, tx);

  // The figures, from the ledger and the obligations, as they are right now (group locked).
  const balances = computeBalances(await readChain(tx, groupId));
  const summary = summarizeBalances(balances);
  const memberships = await tx.membership.findMany({
    where: { groupId, status: { in: ['ACTIVE', 'LEAVING'] } },
    select: {
      id: true,
      status: true,
      activeFromCycle: true,
      userId: true,
      user: { select: { name: true } },
    },
  });
  const owed = await tx.obligation.groupBy({
    by: ['membershipId'],
    where: { groupId, status: 'DUE' },
    _sum: { amount: true },
  });
  const unpaid = new Map(owed.map((row) => [row.membershipId, row._sum.amount ?? 0]));
  const members: CycleCloseMember[] = memberships.map((m) => ({
    membershipId: m.id,
    status: m.status,
    activeFromCycle: m.activeFromCycle,
    unpaidObligations: unpaid.get(m.id) ?? 0,
    receivable: Math.max(0, summary.receivableByMember[m.id] ?? 0),
  }));
  const available = availableForLoans({ summary });
  const plan = planCycleClose({
    cycleNumber: cycle.number,
    distributeFundAtCycleEnd: params.distributeFundAtCycleEnd,
    generalFund: summary.generalFund,
    receivables: summary.receivables,
    availableForLoans: available,
    rotation: cycle.rotation,
    members,
  });

  // 1. The general fund is shared (R9.3). Only money actually collected, never reserved money.
  if (plan.distribution.ok) {
    const { share, shares, distributed, remainder, distributable } = plan.distribution;
    await appendLedgerEntry(tx, groupId, {
      type: 'FUND_DISTRIBUTION',
      occurredAt: now.toISOString(),
      roundId: null,
      membershipId: null,
      refType: 'Cycle',
      refId: cycle.id,
      descriptionFr: `Partage de la caisse générale, cycle ${cycle.number}`,
      descriptionEn: `General fund sharing, cycle ${cycle.number}`,
      metadata: {
        cycleNumber: cycle.number,
        distributable,
        share,
        distributed,
        remainder,
        eligibleCount: shares.length,
      },
      postings: fundDistributionPostings({ shares }),
    });
  }

  // 2. Members who announced leaving go now (R12.2, D40.5): they had their share above.
  for (const id of plan.leavingMembershipIds) {
    const m = memberships.find((row) => row.id === id)!;
    await endLeavingMember(tx, {
      groupId,
      membershipId: id,
      userId: m.userId,
      name: m.user.name,
      cycleId: cycle.id,
      now,
      effects,
    });
  }

  // 3. Rounds close, the group is between cycles (D40.2), and the ledger records it.
  await tx.round.updateMany({
    where: { cycleId: cycle.id, status: 'PAYOUT' },
    data: { status: 'CLOSED' },
  });
  await tx.group.update({ where: { id: groupId }, data: { currentCycleId: null } });
  await appendCycleEvent(tx, {
    groupId,
    event: cycleClosedEvent({ cycleNumber: cycle.number, mode: cycle.mode, facts: plan.event }),
    occurredAt: now,
    refId: cycle.id,
  });
  await audit(
    {
      action: 'cycle.closed',
      groupId,
      target: `Cycle:${cycle.id}`,
      details: {
        cycle: cycle.number,
        shared: plan.distribution.ok,
        eligible: plan.event.eligibleCount,
      },
      system: true,
    },
    tx,
  );

  // 4. The group is told (system line and a notice for each member), in the same transaction.
  await postSystemMessage(
    groupId,
    bilingual(cycleSystemTexts.closed, { cycle: cycle.number }),
    effects,
    tx,
  );
  await postSystemMessage(
    groupId,
    plan.distribution.ok
      ? bilingual(cycleSystemTexts.fundShared, {
          amount: money(plan.distribution.share),
          count: plan.eligibleCount,
        })
      : bilingual(cycleSystemTexts.fundNotShared),
    effects,
    tx,
  );
  const sharing = new Set(
    plan.distribution.ok ? plan.distribution.shares.map((s) => s.membershipId) : [],
  );
  const leaving = new Set(plan.leavingMembershipIds);
  const title = bilingual(cycleNotificationTexts.closedTitle, { cycle: cycle.number });
  const notices: NotificationInput[] = memberships.map((m) => {
    const body = sharing.has(m.id)
      ? bilingual(cycleNotificationTexts.closedBodyShare, {
          amount: money(plan.event.share),
        })
      : plan.distribution.ok &&
          plan.candidates.some((c) => c.membershipId === m.id && c.outstandingDebt > 0)
        ? bilingual(cycleNotificationTexts.closedBodyDebt)
        : leaving.has(m.id)
          ? bilingual(cycleNotificationTexts.closedBodyLeft)
          : bilingual(cycleNotificationTexts.closedBodyNone);
    return { userId: m.userId, groupId, category: 'MONEY', title, body, deepLink: '/caisse' };
  });
  const admin = await tx.membership.findFirst({
    where: { groupId, role: 'ADMIN', status: { in: ['ACTIVE', 'LEAVING'] } },
    select: { userId: true },
  });
  if (admin) notices.push(...(await adminStartNotice(tx, groupId, cycle.number, admin.userId)));
  await createNotifications(notices, effects, tx);
}

/** D40.2, Q7: tells the admin to choose the first payout, or that members are missing. */
export async function adminStartNotice(
  tx: Tx,
  groupId: string,
  closedCycleNumber: number,
  adminUserId: string,
): Promise<NotificationInput[]> {
  const participants = await tx.membership.count({
    where: { groupId, status: { in: ['ACTIVE', 'INVITED'] } },
  });
  return [
    {
      userId: adminUserId,
      groupId,
      category: 'GROUP',
      title: bilingual(cycleNotificationTexts.adminStartTitle),
      body: bilingual(
        participants >= 3
          ? cycleNotificationTexts.adminStartBody
          : cycleNotificationTexts.adminWaitMembersBody,
        { cycle: closedCycleNumber },
      ),
      deepLink: '/caisse',
    },
  ];
}
