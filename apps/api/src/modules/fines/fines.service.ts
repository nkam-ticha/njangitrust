import {
  completeRuleSet,
  fineAssessedPostings,
  installmentFine,
  roundLateFines,
  validateRuleSet,
} from '@njangi/rules';
import type { Job } from 'bullmq';
import { clock } from '../../lib/clock';
import { getPrisma } from '../../lib/prisma';
import { payableAccount } from '@njangi/rules';
import { appendLedgerEntry } from '../ledger';

/** Assess due round fines once. A request opened before dueAt protects the member while pending. */
export async function assessRoundFines(roundId: string, now: Date = clock.now()): Promise<number> {
  const db = getPrisma();
  return db.$transaction(async (tx) => {
    const round = await tx.round.findUnique({
      where: { id: roundId },
      include: { cycle: { select: { id: true } } },
    });
    if (!round || round.dueAt > now) return 0;
    // Serializes competing scheduler instances for the same round.
    await tx.$queryRaw`SELECT "id" FROM "Round" WHERE "id" = ${roundId}::uuid FOR UPDATE`;
    const ruleSet = await tx.ruleSet.findFirstOrThrow({
      where: { groupId: round.groupId, version: round.ruleSetVersion },
    });
    const params = completeRuleSet(ruleSet.params);
    const valid = validateRuleSet(params);
    if (!valid.ok) throw new Error(`Invalid rule set ${round.ruleSetVersion}: ${valid.code}`);
    const obligations = await tx.obligation.findMany({
      where: { roundId, kind: { in: ['CONTRIBUTION', 'SOLIDARITY'] } },
      select: { id: true, membershipId: true, kind: true, status: true },
    });
    const pending = await tx.paymentIntent.findMany({
      where: {
        groupId: round.groupId,
        OR: [{ status: { in: ['CREATED', 'PENDING'] } }, { status: 'EXPIRED' }],
        createdAt: { lt: round.dueAt },
        obligationIds: { hasSome: obligations.map((o) => o.id) },
      },
      select: { obligationIds: true },
    });
    const pendingIds = new Set(pending.flatMap((p) => p.obligationIds));
    const members = await tx.membership.findMany({
      where: { groupId: round.groupId, status: { in: ['ACTIVE', 'LEAVING'] } },
      select: { id: true },
    });
    const standing = members.map((member) => ({
      membershipId: member.id,
      obligations: obligations
        .filter((o) => o.membershipId === member.id)
        .map((o) => ({
          kind: o.kind as 'CONTRIBUTION' | 'SOLIDARITY',
          status: o.status,
          onTimeIntentInProgress: pendingIds.has(o.id),
        })),
    }));
    const fines = roundLateFines({ lateFine: params.lateFine, members: standing });
    let assessed = 0;
    for (const fine of fines) {
      const prior = await tx.obligation.findFirst({
        where: {
          groupId: round.groupId,
          roundId,
          membershipId: fine.membershipId,
          kind: 'FINE',
          loanId: null,
        },
      });
      if (prior) continue;
      const obligation = await tx.obligation.create({
        data: {
          groupId: round.groupId,
          roundId,
          membershipId: fine.membershipId,
          kind: 'FINE',
          amount: fine.amount,
          dueAt: now,
        },
      });
      await appendLedgerEntry(tx, round.groupId, {
        type: 'FINE_ASSESSED',
        occurredAt: now.toISOString(),
        roundId,
        membershipId: fine.membershipId,
        refType: 'Obligation',
        refId: obligation.id,
        descriptionFr: `Amende de retard, tour ${round.number}`,
        descriptionEn: `Late fine, round ${round.number}`,
        metadata: { obligationId: obligation.id, reason: 'ROUND_LATE', roundNumber: round.number },
        postings: fineAssessedPostings({ membershipId: fine.membershipId, amount: fine.amount }),
      });
      assessed++;
    }

    // R6.2: a missed loan installment is fined unless this member's own locked payout covers it
    // after the other debts that auto-settlement takes first.
    const installments = await tx.obligation.findMany({
      where: { roundId, kind: 'LOAN_INSTALLMENT', status: 'DUE', dueAt: { lte: now } },
      select: {
        id: true,
        membershipId: true,
        loanId: true,
        amount: true,
        dueAt: true,
        loan: { select: { status: true } },
      },
    });
    if (installments.length > 0) {
      const intents = await tx.paymentIntent.findMany({
        where: {
          groupId: round.groupId,
          OR: [{ status: { in: ['CREATED', 'PENDING'] } }, { status: 'EXPIRED' }],
          createdAt: { lt: round.dueAt },
          obligationIds: { hasSome: installments.map((o) => o.id) },
        },
        select: { obligationIds: true },
      });
      const inProgress = new Set(intents.flatMap((p) => p.obligationIds));
      const ledger = await tx.ledgerTransaction.findMany({
        where: { groupId: round.groupId },
        include: { postings: { select: { account: true, amount: true } } },
        orderBy: { seq: 'asc' },
      });
      for (const installment of installments) {
        if (
          !installment.loanId ||
          inProgress.has(installment.id) ||
          !['DISBURSED', 'OVERDUE'].includes(installment.loan?.status ?? '')
        )
          continue;
        const currentRound = await tx.round.findUnique({
          where: { id: roundId },
          select: { beneficiaryMembershipId: true },
        });
        const lockedPayout =
          currentRound?.beneficiaryMembershipId === installment.membershipId
            ? ledger
                .filter((entry) => entry.roundId === roundId)
                .flatMap((entry) => entry.postings)
                .filter(
                  (posting) =>
                    posting.account === payableAccount(installment.membershipId) &&
                    posting.amount < 0,
                )
                .reduce((sum, posting) => sum - posting.amount, 0)
            : 0;
        const priorDebts = await tx.obligation.findMany({
          where: {
            membershipId: installment.membershipId,
            status: 'DUE',
            dueAt: { lte: installment.dueAt },
            kind: { in: ['BID', 'FINE', 'CORRECTION', 'LOAN_INSTALLMENT'] },
          },
          select: {
            id: true,
            kind: true,
            amount: true,
            dueAt: true,
            loan: { select: { disbursement: { select: { status: true } } } },
          },
        });
        const determination = installmentFine({
          lateFine: params.lateFine,
          installment: {
            id: installment.id,
            amount: installment.amount,
            dueAt: installment.dueAt,
            status: 'DUE',
            onTimeIntentInProgress: false,
          },
          borrowerIsRoundBeneficiary:
            currentRound?.beneficiaryMembershipId === installment.membershipId,
          lockedPayout,
          otherDueDebts: priorDebts
            .filter((debt) => debt.id !== installment.id)
            .map((debt) => ({
              id: debt.id,
              kind: debt.kind as 'BID' | 'FINE' | 'CORRECTION' | 'LOAN_INSTALLMENT',
              amount: debt.amount,
              dueAt: debt.dueAt,
              loanInFlight: ['CREATED', 'PENDING', 'EXPIRED'].includes(
                debt.loan?.disbursement?.status ?? '',
              ),
            })),
        });
        if (!determination.fined) continue;
        const priorFine = await tx.obligation.findFirst({
          where: {
            groupId: round.groupId,
            roundId,
            membershipId: installment.membershipId,
            kind: 'FINE',
            loanId: installment.loanId,
          },
        });
        if (priorFine) continue;
        await tx.loan.updateMany({
          where: { id: installment.loanId, status: 'DISBURSED' },
          data: { status: 'OVERDUE' },
        });
        const obligation = await tx.obligation.create({
          data: {
            groupId: round.groupId,
            roundId,
            membershipId: installment.membershipId,
            loanId: installment.loanId,
            kind: 'FINE',
            amount: determination.amount,
            dueAt: now,
          },
        });
        await appendLedgerEntry(tx, round.groupId, {
          type: 'FINE_ASSESSED',
          occurredAt: now.toISOString(),
          roundId,
          membershipId: installment.membershipId,
          refType: 'Obligation',
          refId: obligation.id,
          descriptionFr: `Amende de remboursement, tour ${round.number}`,
          descriptionEn: `Loan installment fine, round ${round.number}`,
          metadata: {
            obligationId: obligation.id,
            relatedObligationId: installment.id,
            reason: 'INSTALLMENT_LATE',
            roundNumber: round.number,
          },
          postings: fineAssessedPostings({
            membershipId: installment.membershipId,
            amount: determination.amount,
          }),
        });
        assessed++;
      }
    }
    return assessed;
  });
}

/** Scan the bounded set of due rounds; the round lock and existing fine row make this idempotent. */
export async function assessDueRoundFines(now: Date = clock.now()): Promise<number> {
  const rounds = await getPrisma().round.findMany({
    where: { dueAt: { lte: now }, status: { in: ['OPEN', 'PAYOUT', 'CLOSED'] } },
    select: { id: true },
    take: 500,
    orderBy: { dueAt: 'asc' },
  });
  let count = 0;
  for (const round of rounds) count += await assessRoundFines(round.id, now);
  return count;
}

/** The installment-specific rule is exported for the loan/payout services to run at each dueAt. */
export { installmentFine };

export async function processFineJob(_job: Job): Promise<void> {
  await assessDueRoundFines();
}
