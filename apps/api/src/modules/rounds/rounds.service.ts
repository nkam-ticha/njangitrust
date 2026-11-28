// Round reads and payout breakdowns (spec 2.7, R2, R5). Money totals come from the ledger and
// calculations from @njangi/rules; returned records are allowlisted here.
import { dueDebtsTotal, payableAccount, payoutBreakdown, WITHHELD_DEBT_KINDS } from '@njangi/rules';
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
    // The newest round in progress: an earlier round that is paid out (PAYOUT, and CLOSED once the
    // next one opens) is behind us. Groups whose rounds were never closed rely on this order too.
    where: { cycleId: group.currentCycleId, status: { in: ['OPEN', 'PAYOUT'] } },
    orderBy: { number: 'desc' },
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
  // "Round k of N": N is the cycle's number of rounds (it shrinks when an unserved member leaves).
  const totalRounds = await getPrisma().round.count({ where: { cycleId: cycle.id } });
  const paid = row.obligations.filter(
    (item) => item.kind === 'CONTRIBUTION' && item.status !== 'DUE' && item.status !== 'CANCELLED',
  );
  return {
    round: {
      id: row.id,
      number: row.number,
      cycle: cycle.number,
      totalRounds,
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
      // What the round expects in all (the ring's target): every contribution not cancelled.
      target: row.obligations
        .filter((item) => item.kind === 'CONTRIBUTION' && item.status !== 'CANCELLED')
        .reduce((sum, item) => sum + item.amount, 0),
      unpaidMembershipIds: row.obligations
        .filter((item) => item.kind === 'CONTRIBUTION' && item.status === 'DUE')
        .map((item) => item.membershipId),
    },
  };
}

export async function readPayoutBreakdown(userId: string, groupId: string, number: number) {
  const access = await authorizeGroup(userId, groupId, 'group.rounds.read');
  const cycle = await getPrisma().cycle.findFirst({
    where: { groupId, closedAt: null },
    orderBy: { number: 'desc' },
    select: { id: true },
  });
  if (!cycle) throw roundError('ROUND_NOT_FOUND');
  const round = await getPrisma().round.findUnique({
    where: { cycleId_number: { cycleId: cycle.id, number } },
  });
  if (!round) throw roundError('ROUND_NOT_FOUND');
  if (!round.beneficiaryMembershipId) throw roundError('PAYOUT_NOT_ASSIGNED');
  const entries = await getPrisma().ledgerTransaction.findMany({
    where: { groupId, roundId: round.id },
    include: { postings: true },
    orderBy: { seq: 'asc' },
  });
  const payable = payableAccount(round.beneficiaryMembershipId);
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
  // Spec 2.11, 4.4: what the beneficiary still owes and may withdraw is theirs alone to see.
  const isBeneficiary = access.membership.id === round.beneficiaryMembershipId;
  // D13.3, D18: the debts due are the ones a withdrawal holds back: every unsettled debt of the
  // beneficiary in the group (not only this round's), corrections included, due by now.
  const now = clock.now();
  const debts = isBeneficiary
    ? await getPrisma().obligation.findMany({
        where: {
          groupId,
          membershipId: round.beneficiaryMembershipId,
          status: 'DUE',
          kind: { in: [...WITHHELD_DEBT_KINDS] },
        },
        select: { kind: true, amount: true, dueAt: true, status: true },
      })
    : [];
  // The next withdrawal shown holds those debts back too: it never exceeds what a withdrawal allows.
  const full = payoutBreakdown({
    contributions,
    deductions,
    withdrawals,
    feeSchedule,
    heldForDebts: dueDebtsTotal(debts, now),
  });
  const breakdown = isBeneficiary ? full : { ...full, nextWithdrawal: null };
  return {
    roundId: round.id,
    round: round.number,
    payoutAt: round.payoutAt.toISOString(),
    breakdown,
    debtsDue: dueDebtsTotal(debts, now),
    asOf: now.toISOString(),
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
