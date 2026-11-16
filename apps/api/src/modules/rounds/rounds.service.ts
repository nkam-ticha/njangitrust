// Round reads and payout breakdowns (spec 2.7, R2, R5). Money totals come from the ledger and
// calculations from @njangi/rules; returned records are allowlisted here.
import { payoutBreakdown } from '@njangi/rules';
import { getPrisma } from '../../lib/prisma';
import { clock } from '../../lib/clock';
import { authorizeGroup } from '../../permissions';
import { getEnv } from '../../config/env';
import { roundError } from './rounds.errors';

function memberName(row: { user: { name: string } } | null) {
  return row?.user.name ?? null;
}

export async function currentRound(userId: string, groupId: string) {
  await authorizeGroup(userId, groupId, 'group.rounds.read');
  const group = await getPrisma().group.findUniqueOrThrow({
    where: { id: groupId },
    select: { currentCycleId: true },
  });
  if (!group.currentCycleId) throw roundError('ROUND_NOT_FOUND');
  const round = await getPrisma().round.findFirst({
    where: { cycleId: group.currentCycleId, status: { in: ['OPEN', 'PAYOUT'] } },
    orderBy: { number: 'asc' },
  });
  if (!round) throw roundError('ROUND_NOT_FOUND');
  return readRound(userId, groupId, round.number);
}

export async function readRound(userId: string, groupId: string, number: number) {
  await authorizeGroup(userId, groupId, 'group.rounds.read');
  const cycle = await getPrisma().cycle.findFirst({
    where: { groupId, closedAt: null },
    orderBy: { number: 'desc' },
    select: { id: true, number: true, mode: true },
  });
  if (!cycle) throw roundError('ROUND_NOT_FOUND');
  const row = await getPrisma().round.findUnique({
    where: { cycleId_number: { cycleId: cycle.id, number } },
    include: {
      beneficiary: { include: { user: { select: { name: true } } } },
      obligations: {
        select: {
          membershipId: true,
          kind: true,
          status: true,
          amount: true,
          paidAt: true,
          onTime: true,
        },
      },
    },
  });
  if (!row) throw roundError('ROUND_NOT_FOUND');
  const paid = row.obligations.filter(
    (item) => item.kind === 'CONTRIBUTION' && item.status !== 'DUE' && item.status !== 'CANCELLED',
  );
  return {
    round: {
      id: row.id,
      number: row.number,
      cycle: cycle.number,
      mode: cycle.mode,
      status: row.status,
      dueAt: row.dueAt.toISOString(),
      payoutAt: row.payoutAt.toISOString(),
      beneficiaryMembershipId: row.beneficiaryMembershipId,
      beneficiaryName: memberName(row.beneficiary),
      contributionAmount:
        row.obligations.find((item) => item.kind === 'CONTRIBUTION')?.amount ?? null,
      paidCount: paid.length,
      contributionCount: row.obligations.filter((item) => item.kind === 'CONTRIBUTION').length,
      collected: paid.reduce((sum, item) => sum + item.amount, 0),
      unpaidMembershipIds: row.obligations
        .filter((item) => item.kind === 'CONTRIBUTION' && item.status === 'DUE')
        .map((item) => item.membershipId),
    },
  };
}

export async function readPayoutBreakdown(userId: string, groupId: string, number: number) {
  await authorizeGroup(userId, groupId, 'group.rounds.read');
  const cycle = await getPrisma().cycle.findFirst({
    where: { groupId, closedAt: null },
    orderBy: { number: 'desc' },
    select: { id: true },
  });
  if (!cycle) throw roundError('ROUND_NOT_FOUND');
  const round = await getPrisma().round.findUnique({
    where: { cycleId_number: { cycleId: cycle.id, number } },
    include: {
      obligations: {
        select: {
          id: true,
          kind: true,
          amount: true,
          status: true,
          membershipId: true,
          dueAt: true,
        },
      },
    },
  });
  if (!round) throw roundError('ROUND_NOT_FOUND');
  if (!round.beneficiaryMembershipId) throw roundError('PAYOUT_NOT_ASSIGNED');
  const entries = await getPrisma().ledgerTransaction.findMany({
    where: { groupId, roundId: round.id },
    include: { postings: true },
    orderBy: { seq: 'asc' },
  });
  const payable = `payable:member:${round.beneficiaryMembershipId}`;
  const contributions: { amount: number; feeShare: number }[] = [];
  const deductions: { kind: 'BID' | 'FINE' | 'CORRECTION' | 'LOAN_INSTALLMENT'; amount: number }[] =
    [];
  const withdrawals: { amount: number; fee: number }[] = [];
  for (const entry of entries) {
    const metadata = entry.metadata as Record<string, unknown>;
    if (entry.type === 'PAYMENT_RECEIVED' && Array.isArray(metadata.parts)) {
      for (const raw of metadata.parts) {
        if (!raw || typeof raw !== 'object') continue;
        const part = raw as Record<string, unknown>;
        if (
          part.kind === 'CONTRIBUTION' &&
          part.account === payable &&
          Number.isSafeInteger(part.amount)
        ) {
          contributions.push({
            amount: Number(part.amount),
            feeShare: Number.isSafeInteger(part.feeShare) ? Number(part.feeShare) : 0,
          });
        }
      }
    }
    if (entry.type === 'AUTO_SETTLEMENT' && Array.isArray(metadata.debts)) {
      for (const raw of metadata.debts) {
        if (!raw || typeof raw !== 'object') continue;
        const debt = raw as Record<string, unknown>;
        if (
          ['BID', 'FINE', 'CORRECTION', 'LOAN_INSTALLMENT'].includes(String(debt.kind)) &&
          Number.isSafeInteger(debt.amount)
        )
          deductions.push({
            kind: debt.kind as (typeof deductions)[number]['kind'],
            amount: Number(debt.amount),
          });
      }
    }
    if (entry.type === 'WITHDRAWAL_COMPLETED') {
      const posting = entry.postings.find((item) => item.account === payable && item.amount > 0);
      if (posting) {
        const meta = metadata;
        withdrawals.push({ amount: Number(meta.amount ?? 0), fee: Number(meta.feeActual ?? 0) });
      }
    }
  }
  const configured = getEnv().FEE_SCHEDULE;
  const feeSchedule = {
    collection: [
      { upTo: null, fixed: configured.collection, ratePermille: configured.collectionPermille },
    ],
    disbursement: [
      { upTo: null, fixed: configured.disbursement, ratePermille: configured.disbursementPermille },
    ],
  };
  const breakdown = payoutBreakdown({ contributions, deductions, withdrawals, feeSchedule });
  const holds = round.obligations.filter(
    (item) => item.membershipId === round.beneficiaryMembershipId && item.status === 'DUE',
  );
  return {
    roundId: round.id,
    round: round.number,
    payoutAt: round.payoutAt.toISOString(),
    breakdown,
    debtsDue: holds.reduce(
      (sum, item) =>
        sum +
        (item.kind === 'FINE' || item.kind === 'BID' || item.kind === 'LOAN_INSTALLMENT'
          ? item.amount
          : 0),
      0,
    ),
    asOf: clock.now().toISOString(),
  };
}

/** When the member receives the pot in the current cycle: their round and its payout time. */
export async function myTurn(userId: string, groupId: string) {
  const access = await authorizeGroup(userId, groupId, 'group.rounds.read');
  const cycle = await getPrisma().cycle.findFirst({
    where: { groupId, closedAt: null },
    orderBy: { number: 'desc' },
    select: { id: true },
  });
  if (!cycle) return null;
  const round = await getPrisma().round.findFirst({
    where: { cycleId: cycle.id, beneficiaryMembershipId: access.membership.id },
    select: { number: true, payoutAt: true, status: true },
  });
  return round ? { round: round.number, payoutAt: round.payoutAt, status: round.status } : null;
}
