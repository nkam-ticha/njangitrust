// Reads about cycles (D40): the list, what a closed cycle did with the general fund, and the preview
// of the next one. Every value is allowlisted here; the fund figures are the public ledger's (R10.4),
// and a member sees only their own outcome (never who else owes what).
import {
  canStartCycle,
  computeBalances,
  MIN_MEMBERS_TO_START,
  payableAccount,
  summarizeBalances,
  type RotationMode,
} from '@njangi/rules';
import type {
  CycleItem,
  CycleList,
  CycleSummary,
  NextCyclePreview,
} from '@njangi/shared/contracts/cycles';
import { clock } from '../../lib/clock';
import { getPrisma } from '../../lib/prisma';
import { authorizeGroup } from '../../permissions';
import { readChain } from '../statements/ledger-read';
import { nextCycleError } from './cycles.errors';
import { previewNextCycle } from './cycles.next';

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

const toItem = (c: {
  number: number;
  mode: RotationMode;
  startedAt: Date | null;
  closedAt: Date | null;
}): CycleItem => ({
  number: c.number,
  mode: c.mode,
  startedAt: iso(c.startedAt),
  closedAt: iso(c.closedAt),
});

/** GET /groups/:id/cycles: the phase of the group and its cycles, newest first. */
export async function listCycles(userId: string, groupId: string): Promise<CycleList> {
  const access = await authorizeGroup(userId, groupId, 'group.rounds.read');
  const db = getPrisma();
  const cycles = await db.cycle.findMany({
    where: { groupId },
    orderBy: { number: 'desc' },
    select: { id: true, number: true, mode: true, startedAt: true, closedAt: true },
  });
  const { status } = access.group;
  const { currentCycleId } = await db.group.findUniqueOrThrow({
    where: { id: groupId },
    select: { currentCycleId: true },
  });
  const phase =
    status === 'FORMING'
      ? 'FORMING'
      : status === 'CLOSED'
        ? 'CLOSED'
        : currentCycleId
          ? 'IN_CYCLE'
          : 'BETWEEN_CYCLES';
  const current = cycles.find((c) => c.id === currentCycleId);
  const participants =
    phase === 'BETWEEN_CYCLES'
      ? await db.membership.count({ where: { groupId, status: { in: ['ACTIVE', 'INVITED'] } } })
      : null;
  return {
    phase,
    current: current ? toItem(current) : null,
    cycles: cycles.map(toItem),
    participants,
  };
}

/** GET /groups/:id/cycles/:number: the cycle, its fund result and the caller's own outcome. */
export async function readCycleSummary(
  userId: string,
  groupId: string,
  number: number,
): Promise<CycleSummary> {
  const access = await authorizeGroup(userId, groupId, 'group.rounds.read');
  const db = getPrisma();
  const cycle = await db.cycle.findUnique({
    where: { groupId_number: { groupId, number } },
    select: { id: true, number: true, mode: true, startedAt: true, closedAt: true },
  });
  if (!cycle) throw nextCycleError('CYCLE_NOT_FOUND');
  const base = toItem(cycle);
  if (!cycle.closedAt) return { ...base, fund: null, mine: null };

  const closed = await db.ledgerTransaction.findFirst({
    where: {
      groupId,
      type: 'EVENT',
      refType: 'Cycle',
      refId: cycle.id,
      metadata: { path: ['event'], equals: 'CYCLE_CLOSED' },
    },
    select: { metadata: true },
  });
  const m = (closed?.metadata ?? {}) as Record<string, unknown>;
  const int = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) ? v : 0);
  const reason: 'DISTRIBUTION_OFF' | 'NOTHING_TO_DISTRIBUTE' | 'NO_ELIGIBLE_MEMBER' | null =
    m.reason === 'DISTRIBUTION_OFF' ||
    m.reason === 'NOTHING_TO_DISTRIBUTE' ||
    m.reason === 'NO_ELIGIBLE_MEMBER'
      ? m.reason
      : null;
  const fund = {
    fundBalance: int(m.fundBalance),
    receivables: int(m.receivables),
    distributable: int(m.distributable),
    share: int(m.share),
    distributed: int(m.distributed),
    remainder: int(m.remainder),
    eligibleCount: int(m.eligibleCount),
    reason,
  };

  const me = access.membership.id;
  const own = await db.ledgerPosting.findFirst({
    where: {
      account: payableAccount(me),
      transaction: { groupId, type: 'FUND_DISTRIBUTION', refType: 'Cycle', refId: cycle.id },
    },
    select: { amount: true },
  });
  const membership = await db.membership.findUniqueOrThrow({
    where: { id: me },
    select: { activeFromCycle: true, leftAt: true, status: true },
  });
  const leftAtEnd =
    membership.status === 'LEFT' && membership.leftAt?.getTime() === cycle.closedAt.getTime();
  let outcome: 'SHARE' | 'DEBT' | 'NOT_IN_CYCLE' | 'NOTHING_SHARED';
  let owed = 0;
  if (own) outcome = 'SHARE';
  else if (
    // Not part of the cycle at all: that is the answer even when nothing was shared.
    (membership.activeFromCycle ?? 1) > cycle.number ||
    (membership.leftAt !== null && membership.leftAt < cycle.closedAt)
  )
    outcome = 'NOT_IN_CYCLE';
  else if (reason !== null) outcome = 'NOTHING_SHARED';
  else {
    outcome = 'DEBT';
    const total = await db.obligation.aggregate({
      where: { groupId, membershipId: me, status: 'DUE' },
      _sum: { amount: true },
    });
    // The same measure the close rule used (R7.8): the larger of the unpaid obligations and what the
    // ledger says the member owes the fund, so a debt held only in the ledger is not shown as 0.
    const receivable = summarizeBalances(computeBalances(await readChain(db, groupId)))
      .receivableByMember[me];
    owed = Math.max(total._sum.amount ?? 0, Math.max(0, receivable ?? 0));
  }
  return {
    ...base,
    fund,
    mine: { outcome, share: own ? -own.amount : 0, owed, leftAtEnd },
  };
}

/** GET /groups/:id/cycles/next: what the next cycle will look like, between two cycles. */
export async function readNextCycle(userId: string, groupId: string): Promise<NextCyclePreview> {
  const access = await authorizeGroup(userId, groupId, 'group.rounds.read');
  const preview = await previewNextCycle(getPrisma(), groupId, clock.now());
  return {
    number: preview.number,
    participants: preview.participantCount,
    newcomers: preview.newcomerCount,
    minimum: MIN_MEMBERS_TO_START,
    canStart: access.membership.role === 'ADMIN' && canStartCycle(preview.participantCount).ok,
    orderKind: preview.orderKind,
    order: preview.order,
    suggestedFirstPayoutAt: preview.suggestedFirstPayoutAt.toISOString(),
  };
}
