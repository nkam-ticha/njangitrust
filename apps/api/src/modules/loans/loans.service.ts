import {
  availableForLoans,
  computeBalances,
  loanEligibility,
  loanLimit,
  loanQuote as calculateLoanQuote,
  roundDates,
  summarizeBalances,
  type FeeSchedule,
  selectInstallmentsForRepayment,
} from '@njangi/rules';
import { getEnv } from '../../config/env';
import { clock } from '../../lib/clock';
import { getPrisma, type Db, type Prisma } from '../../lib/prisma';
import { authorizeGroup, type AuthActor } from '../../permissions';
import { createPendingAction, type ActionOrigin } from '../pending-actions';
import { getCurrentParams } from '../rulesets';
import { loanError } from './loans.errors';

export const configuredFeeSchedule = (): FeeSchedule => {
  const configured = getEnv().FEE_SCHEDULE;
  return {
    collection: [{ upTo: null, fixed: configured.collection, ratePermille: 0 }],
    disbursement: [{ upTo: null, fixed: configured.disbursement, ratePermille: 0 }],
  };
};

export type LoanDisbursementScheduler = (loanId: string) => Promise<void>;
let loanDisbursementScheduler: LoanDisbursementScheduler | null = null;

/** Wired at start-up by the provider/disbursement module; approval cannot imply cash was sent. */
export function registerLoanDisbursementScheduler(schedule: LoanDisbursementScheduler): void {
  loanDisbursementScheduler = schedule;
}

export function scheduleApprovedLoanDisbursement(loanId: string): Promise<void> {
  if (!loanDisbursementScheduler) throw loanError('LOAN_UNAVAILABLE');
  return loanDisbursementScheduler(loanId);
}

export function hasLoanDisbursementScheduler(): boolean {
  return loanDisbursementScheduler !== null;
}

async function quoteContext(
  db: Db,
  groupId: string,
  membershipId: string,
  now: Date,
  excludeLoanId?: string,
) {
  const group = await db.group.findUnique({
    where: { id: groupId },
    select: {
      currentCycleId: true,
      memberships: { where: { id: membershipId }, select: { status: true } },
    },
  });
  if (!group?.currentCycleId) throw loanError('NO_ACTIVE_CYCLE');
  const membershipStatus = group.memberships[0]?.status;
  if (!membershipStatus) throw loanError('LOAN_NOT_FOUND');

  const cycle = await db.cycle.findUniqueOrThrow({
    where: { id: group.currentCycleId },
    include: { rounds: { orderBy: { number: 'asc' }, select: { dueAt: true, payoutAt: true } } },
  });
  const params = await getCurrentParams(groupId, db);
  const [paidContributions, outstandingLoan, activeLoans, debts, transactions] = await Promise.all([
    db.obligation.aggregate({
      where: {
        membershipId,
        kind: 'CONTRIBUTION',
        status: { in: ['PAID', 'SETTLED'] },
        round: { cycleId: cycle.id },
      },
      _sum: { amount: true },
    }),
    db.loan.aggregate({
      where: {
        membershipId,
        id: excludeLoanId ? { not: excludeLoanId } : undefined,
        status: { in: ['DISBURSED', 'OVERDUE'] },
      },
      _sum: { principal: true },
    }),
    db.loan.count({
      where: {
        membershipId,
        id: excludeLoanId ? { not: excludeLoanId } : undefined,
        status: { in: ['REQUESTED', 'APPROVED', 'DISBURSED', 'OVERDUE'] },
      },
    }),
    db.obligation.findMany({
      where: {
        membershipId,
        status: 'DUE',
        kind: { in: ['FINE', 'BID', 'CORRECTION', 'LOAN_INSTALLMENT'] },
      },
      select: { kind: true, amount: true, dueAt: true },
    }),
    db.ledgerTransaction.findMany({
      where: { groupId },
      include: { postings: { select: { account: true, amount: true } } },
      orderBy: { seq: 'asc' },
    }),
  ]);
  const summary = summarizeBalances(computeBalances(transactions));
  const feeSchedule = configuredFeeSchedule();
  const limit = loanLimit({
    loanLimitFactorPermille: params.loanLimitFactorPermille,
    contributionsPaidThisCycle: paidContributions._sum.amount ?? 0,
    outstandingPrincipal: outstandingLoan._sum.principal ?? 0,
    availableForLoans: availableForLoans({ summary }),
    feeSchedule,
  });
  const eligibility = loanEligibility({
    membershipStatus: membershipStatus,
    hasActiveLoan: activeLoans > 0,
    unpaidDebts: debts.map((d) => ({
      kind: d.kind as 'FINE' | 'BID' | 'CORRECTION' | 'LOAN_INSTALLMENT',
      amount: d.amount,
      dueAt: d.dueAt,
    })),
    now,
  });
  return { cycle, params, feeSchedule, limit, eligibility };
}

export async function getLoanQuote(
  userId: string,
  groupId: string,
  input: { amount: number; months: number },
  now: Date = clock.now(),
  db: Db = getPrisma(),
  excludeLoanId?: string,
) {
  const access = await authorizeGroup(userId, groupId, 'group.loans.request', db);
  const context = await quoteContext(db, groupId, access.membership.id, now, excludeLoanId);
  if (!context.eligibility.ok)
    return { ok: false as const, code: context.eligibility.code, limit: context.limit.limit };
  const quote = calculateLoanQuote({
    principal: input.amount,
    months: input.months,
    loanRatePermille: context.params.loanRatePermille,
    loanMaxMonths: context.params.loanMaxMonths,
    feeSchedule: context.feeSchedule,
    limit: context.limit.limit,
    approvedAt: now,
    frequency: context.params.frequency,
    rounds: context.cycle.rounds,
  });
  return { ...quote, limit: context.limit.limit, ratePermille: context.params.loanRatePermille };
}

export async function requestLoan(
  actor: AuthActor,
  groupId: string,
  input: { amount: number; months: number },
  origin: ActionOrigin = 'UI',
) {
  return createPendingAction({
    userId: actor.userId,
    groupId,
    lang: actor.lang,
    origin,
    type: 'REQUEST_LOAN',
    args: { groupId, amount: input.amount, months: input.months },
  });
}

export async function listLoans(userId: string, groupId: string) {
  await authorizeGroup(userId, groupId, 'group.loans.read');
  const loans = await getPrisma().loan.findMany({
    where: { groupId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      principal: true,
      months: true,
      ratePermille: true,
      interest: true,
      feeEstimated: true,
      totalDue: true,
      status: true,
      decisionReason: true,
      createdAt: true,
      decidedAt: true,
      membership: { select: { id: true, user: { select: { name: true } } } },
      obligations: {
        orderBy: { dueAt: 'asc' },
        select: { id: true, kind: true, amount: true, dueAt: true, status: true },
      },
    },
  });
  return loans.map((loan) => ({
    id: loan.id,
    borrower: { membershipId: loan.membership.id, name: loan.membership.user.name },
    principal: loan.principal,
    months: loan.months,
    // Request rows carry provisional database defaults only; LOA-02 terms become final at approval.
    ratePermille: loan.status === 'REQUESTED' ? null : loan.ratePermille,
    interest: loan.status === 'REQUESTED' ? null : loan.interest,
    feeEstimated: loan.status === 'REQUESTED' ? null : loan.feeEstimated,
    totalDue: loan.status === 'REQUESTED' ? null : loan.totalDue,
    status: loan.status,
    decisionReason: loan.decisionReason,
    createdAt: loan.createdAt,
    decidedAt: loan.decidedAt,
    installments: loan.obligations.map((obligation) => ({
      id: obligation.id,
      amount: obligation.amount,
      dueAt: obligation.dueAt,
      status: obligation.status,
    })),
  }));
}

export async function requestLoanDecision(
  actor: AuthActor,
  loanId: string,
  input: { decision: 'approve' | 'reject'; reason: string },
  origin: ActionOrigin = 'UI',
) {
  const loan = await getPrisma().loan.findUnique({
    where: { id: loanId },
    select: { groupId: true },
  });
  if (!loan) throw loanError('LOAN_NOT_FOUND');
  return createPendingAction({
    userId: actor.userId,
    groupId: loan.groupId,
    lang: actor.lang,
    origin,
    type: 'DECIDE_LOAN',
    args: { loanId, decision: input.decision, reason: input.reason },
  });
}

export async function requestLoanRepayment(
  actor: AuthActor,
  loanId: string,
  amount: number | 'ALL' | 'NEXT' = 'NEXT',
  origin: ActionOrigin = 'UI',
) {
  const loan = await getPrisma().loan.findUnique({
    where: { id: loanId },
    select: { id: true, groupId: true, membershipId: true, status: true },
  });
  if (!loan) throw loanError('LOAN_NOT_FOUND');
  const access = await authorizeGroup(actor.userId, loan.groupId, 'group.loans.request');
  if (access.membership.id !== loan.membershipId) throw loanError('LOAN_NOT_YOURS');
  if (!['DISBURSED', 'OVERDUE'].includes(loan.status)) throw loanError('LOAN_NOT_PENDING');
  const unpaid = await getPrisma().obligation.findMany({
    where: { loanId, kind: 'LOAN_INSTALLMENT', status: 'DUE' },
    orderBy: { dueAt: 'asc' },
    select: { id: true, amount: true, dueAt: true },
  });
  const selected = selectInstallmentsForRepayment(unpaid, amount);
  if (!selected.ok) {
    throw loanError(
      selected.code === 'NOTHING_TO_REPAY' ? 'NOTHING_TO_REPAY' : 'AMOUNT_NOT_WHOLE_INSTALLMENTS',
    );
  }
  return createPendingAction({
    userId: actor.userId,
    groupId: loan.groupId,
    lang: actor.lang,
    origin,
    type: 'PAY',
    args: { groupId: loan.groupId, obligationIds: selected.installmentIds },
  });
}

export async function validateDecision(
  db: Db,
  input: {
    loanId: string;
    userId: string;
    decision: 'approve' | 'reject';
    reason: string;
    now: Date;
  },
) {
  const loan = await db.loan.findUnique({
    where: { id: input.loanId },
    include: { membership: { select: { id: true, groupId: true, userId: true } } },
  });
  if (!loan) throw loanError('LOAN_NOT_FOUND');
  const admin = await authorizeGroup(input.userId, loan.groupId, 'group.loans.decide', db);
  if (admin.membership.id === loan.membership.id) throw loanError('LOAN_ADMIN_VOTE');
  if (loan.status !== 'REQUESTED') throw loanError('LOAN_NOT_PENDING');
  if (input.now.getTime() >= loan.createdAt.getTime() + 72 * 60 * 60 * 1000)
    throw loanError('LOAN_REQUEST_EXPIRED');
  if (!input.reason.trim()) throw loanError('LOAN_REASON_REQUIRED');
  if (input.decision === 'reject') return { loan, quote: null };
  const quote = await getLoanQuote(
    loan.membership.userId,
    loan.groupId,
    { amount: loan.principal, months: loan.months },
    input.now,
    db,
    loan.id,
  );
  if (!quote.ok) throw loanError('LOAN_UNAVAILABLE');
  return { loan, quote };
}

export async function applyLoanDecision(
  tx: Prisma.TransactionClient,
  loanId: string,
  decision: 'approve' | 'reject',
  reason: string,
  now: Date,
  quote?: Extract<Awaited<ReturnType<typeof getLoanQuote>>, { ok: true }>,
) {
  if (decision === 'approve' && !quote) throw loanError('LOAN_UNAVAILABLE');
  const decided = await tx.loan.update({
    where: { id: loanId },
    data: {
      status: decision === 'approve' ? 'APPROVED' : 'REJECTED',
      decisionReason: reason.trim(),
      decidedAt: now,
      ...(decision === 'approve' && quote
        ? {
            ratePermille: quote.ratePermille,
            interest: quote.interest,
            feeEstimated: quote.feeEstimate,
            totalDue: quote.totalDue,
          }
        : {}),
    },
  });
  if (decision !== 'approve' || !quote) return decided;

  const existing = await tx.obligation.count({ where: { loanId, kind: 'LOAN_INSTALLMENT' } });
  if (existing > 0) throw loanError('LOAN_NOT_PENDING');
  const group = await tx.group.findUniqueOrThrow({
    where: { id: decided.groupId },
    select: { currentCycleId: true },
  });
  if (!group.currentCycleId) throw loanError('NO_ACTIVE_CYCLE');
  const cycle = await tx.cycle.findUniqueOrThrow({
    where: { id: group.currentCycleId },
    include: {
      rounds: {
        orderBy: { number: 'asc' },
        select: { id: true, number: true, dueAt: true, payoutAt: true },
      },
    },
  });
  const params = await getCurrentParams(decided.groupId, tx);
  const planned = quote.installments.map((installment) => {
    let dueAt: Date;
    if (installment.due.status === 'DATED') {
      dueAt = installment.due.dueAt;
    } else {
      const anchor = {
        firstPayoutAt: cycle.firstPayoutAt,
        frequency: params.frequency,
        monthlyAnchor: params.payoutTime.monthlyAnchor,
      };
      if (installment.due.nthRound !== null) {
        dueAt = roundDates(anchor, cycle.rounds.length + installment.due.nthRound).dueAt;
      } else {
        const onOrAfter = installment.due.onOrAfter;
        if (!onOrAfter) throw loanError('NO_ACTIVE_CYCLE');
        let match: Date | null = null;
        for (let number = cycle.rounds.length + 1; number <= cycle.rounds.length + 100; number++) {
          const candidate = roundDates(anchor, number).dueAt;
          if (candidate >= onOrAfter) {
            match = candidate;
            break;
          }
        }
        if (!match) throw loanError('NO_ACTIVE_CYCLE');
        dueAt = match;
      }
    }
    const roundId =
      cycle.rounds.find((round) => round.dueAt.getTime() === dueAt.getTime())?.id ?? null;
    return {
      groupId: decided.groupId,
      membershipId: decided.membershipId,
      loanId,
      roundId,
      kind: 'LOAN_INSTALLMENT' as const,
      amount: installment.amount,
      dueAt,
    };
  });
  if (planned.length > 0) await tx.obligation.createMany({ data: planned });
  return decided;
}

/** ADMIN_LOAN votes are the only valid path for an admin's own loan (R7.4). */
export async function decideAdminLoanByVote(
  tx: Prisma.TransactionClient,
  input: { groupId: string; loanId: string; approved: boolean; now: Date },
) {
  const loan = await tx.loan.findUnique({
    where: { id: input.loanId },
    include: { membership: { select: { userId: true, role: true } } },
  });
  if (
    !loan ||
    loan.groupId !== input.groupId ||
    loan.membership.role !== 'ADMIN' ||
    loan.status !== 'REQUESTED'
  )
    throw loanError('LOAN_NOT_PENDING');
  if (!input.approved)
    return applyLoanDecision(tx, loan.id, 'reject', 'ADMIN_LOAN_VOTE_REJECTED', input.now);
  const quote = await getLoanQuote(
    loan.membership.userId,
    loan.groupId,
    { amount: loan.principal, months: loan.months },
    input.now,
    tx,
    loan.id,
  );
  if (!quote.ok) throw loanError('LOAN_UNAVAILABLE');
  return applyLoanDecision(tx, loan.id, 'approve', 'ADMIN_LOAN_VOTE_APPROVED', input.now, quote);
}

/** Called in the payment settlement transaction after each installment is marked PAID. */
export async function markLoanRepaidWhenClear(
  tx: Prisma.TransactionClient,
  loanId: string,
): Promise<void> {
  const unpaid = await tx.obligation.count({
    where: { loanId, kind: 'LOAN_INSTALLMENT', status: 'DUE' },
  });
  if (unpaid === 0) {
    await tx.loan.updateMany({
      where: { id: loanId, status: { in: ['DISBURSED', 'OVERDUE'] } },
      data: { status: 'REPAID' },
    });
  }
}
