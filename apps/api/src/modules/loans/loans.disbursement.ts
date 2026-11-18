// R7.5/R13.5: an approval is only a request to disburse. The provider operation is created and
// written to the ledger here, and becomes a loan only after the provider confirms it.
import {
  activeHold,
  availableForLoans,
  computeBalances,
  summarizeBalances,
  validateLoanDisbursement,
} from '@njangi/rules';
import { randomUUID } from 'node:crypto';
import type { Job } from 'bullmq';
import { getPrisma } from '../../lib/prisma';
import { clock } from '../../lib/clock';
import { dispatchJob } from '../../jobs/dispatch';
import { registerJob, registerRepeatable } from '../../jobs/registry';
import { getCurrentParams } from '../rulesets';
import { createLoanDisbursement } from '../payouts/withdrawals.service';
import { registerLoanDisbursementScheduler } from './loans.service';

export async function scheduleLoanDisbursement(loanId: string): Promise<void> {
  await dispatchJob(
    'loans.disburse',
    { loanId },
    { jobId: `loan-disburse-${loanId}-${randomUUID()}` },
  );
}

export async function disburseApprovedLoan(loanId: string): Promise<void> {
  const db = getPrisma();
  const created = await db.$transaction(async (tx) => {
    // Exit settlement locks the membership before expiring an approved loan. Use the same
    // lock order here so an exit cannot miss a disbursement created concurrently.
    const owner = await tx.loan.findUnique({
      where: { id: loanId },
      select: { groupId: true, membershipId: true },
    });
    if (!owner) return null;
    // Exit refunds and other disbursements both spend the loan-available general fund.
    // Serialize that balance check with the group lock used by exit settlement.
    await tx.$queryRaw`SELECT "id" FROM "Group" WHERE "id" = ${owner.groupId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Membership" WHERE "id" = ${owner.membershipId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Loan" WHERE "id" = ${loanId}::uuid FOR UPDATE`;
    const loan = await tx.loan.findUnique({
      where: { id: loanId },
      include: {
        membership: {
          include: {
            user: { include: { paymentNumbers: { where: { activeTo: null }, take: 1 } } },
          },
        },
      },
    });
    if (
      !loan ||
      loan.status !== 'APPROVED' ||
      !['ACTIVE', 'LEAVING'].includes(loan.membership.status)
    )
      return null;
    const linked = loan.disbursementId
      ? await tx.disbursement.findUnique({
          where: { id: loan.disbursementId },
          select: { id: true, status: true },
        })
      : null;
    if (linked && ['CREATED', 'PENDING', 'EXPIRED', 'SUCCESSFUL'].includes(linked.status))
      return null;
    const params = await getCurrentParams(loan.groupId, tx);
    const user = loan.membership.user;
    const number = user.paymentNumbers[0];
    const hasPreviousNumber = number
      ? (await tx.paymentNumber.count({
          where: {
            userId: user.id,
            activeTo: { not: null },
            activeFrom: { lte: number.activeFrom },
          },
        })) > 0
      : false;
    const hold = activeHold({
      numberChangedAt: hasPreviousNumber ? (number?.activeFrom ?? null) : null,
      pinResetAt: user.pinResetAt,
      holdHours: params.numberChangeHoldHours,
      now: clock.now(),
    });
    const group = await tx.group.findUniqueOrThrow({
      where: { id: loan.groupId },
      select: { providerAccount: true },
    });
    const reconciliation = await tx.reconciliationRun.findFirst({
      where: { providerAccount: group.providerAccount },
      orderBy: { ranAt: 'desc' },
      select: { status: true },
    });
    const transactions = await tx.ledgerTransaction.findMany({
      where: { groupId: loan.groupId },
      include: { postings: { select: { account: true, amount: true } } },
      orderBy: { seq: 'asc' },
    });
    const summary = summarizeBalances(computeBalances(transactions));
    const check = validateLoanDisbursement({
      loanStatus: loan.status,
      principal: loan.principal,
      feeEstimate: loan.feeEstimated,
      availableForLoans: availableForLoans({ summary }),
      hold,
      reconciliationStatus: reconciliation?.status ?? null,
      hasActivePaymentNumber: Boolean(number),
    });
    if (!check.ok) return null;
    const disbursement = await createLoanDisbursement(tx, {
      groupId: loan.groupId,
      loanId: loan.id,
      membershipId: loan.membershipId,
      phone: number!.number,
      principal: loan.principal,
      interest: loan.interest,
      feeEstimated: loan.feeEstimated,
    });
    return disbursement.id;
  });
  if (created)
    await dispatchJob(
      'disbursements.submit',
      { disbursementId: created },
      { jobId: `disbursement-submit-${created}` },
    );
}

export function registerLoanDisbursementJob(): void {
  registerLoanDisbursementScheduler(scheduleLoanDisbursement);
  registerJob({
    name: 'loans.disburse',
    attempts: 1,
    keepNoHistory: true,
    process: async (job: Job<{ loanId: string }>) => {
      await disburseApprovedLoan(job.data.loanId);
    },
  });
  registerJob({
    name: 'loans.disburse.scan',
    keepNoHistory: true,
    process: async () => {
      const loans = await getPrisma().loan.findMany({
        where: { status: 'APPROVED' },
        select: { id: true },
        orderBy: { decidedAt: 'asc' },
        take: 100,
      });
      for (const loan of loans) await disburseApprovedLoan(loan.id);
    },
  });
  registerRepeatable({
    id: 'loans.disburse.scan.hourly',
    name: 'loans.disburse.scan',
    pattern: '0 * * * *',
  });
}
