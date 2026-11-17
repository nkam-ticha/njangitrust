// What a passed vote changes in the running cycle (D13.1 rule changes, R12.3 and D13.4 exits).
// Calculations stay in @njangi/rules; this module loads state, persists the result and records
// it in the ledger, all inside the vote's own database transaction.
import {
  availableForLoans,
  computeBalances,
  exitSettlement,
  leaverRefundPostings,
  naturalBalance,
  payableAccount,
  removeFromRotation,
  rescheduleFromRound,
  roundDatesInSegments,
  roundObligations,
  ruleChangeTargetRound,
  sumFcfa,
  summarizeBalances,
  type RuleSetParams,
} from '@njangi/rules';
import { clock } from '../../lib/clock';
import type { Prisma } from '../../lib/prisma';
import { appendLedgerEntry } from '../ledger';
import { settleDueDebts } from '../payouts/payouts.settlement';
import { getCurrentParams } from '../rulesets';
import { readChain } from '../statements/ledger-read';

type Tx = Prisma.TransactionClient;

const DEBT_KINDS = ['BID', 'FINE', 'CORRECTION', 'LOAN_INSTALLMENT'] as const;
const OPEN_PAYMENT = ['CREATED', 'PENDING', 'EXPIRED'] as const;

async function lockGroup(tx: Tx, groupId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Group" WHERE "id" = ${groupId}::uuid FOR UPDATE`;
}

async function currentCycle(tx: Tx, groupId: string) {
  const group = await tx.group.findUnique({
    where: { id: groupId },
    select: { currentCycleId: true },
  });
  if (!group?.currentCycleId) return null;
  return tx.cycle.findUniqueOrThrow({
    where: { id: group.currentCycleId },
    select: {
      id: true,
      number: true,
      mode: true,
      rotation: true,
      rounds: {
        orderBy: { number: 'asc' },
        select: {
          id: true,
          number: true,
          status: true,
          dueAt: true,
          payoutAt: true,
          beneficiaryMembershipId: true,
        },
      },
    },
  });
}

/**
 * D13.1: a new rule set version applies from the first round not yet opened. Those rounds take
 * the version; when the frequency or the payout time changed they are re-dated from the round in
 * progress, never with a deadline in the past, and the loan installments tied to them follow.
 * When every round is already open the version waits for the next cycle. A change of rotation
 * mode also waits for the next cycle: a cycle runs in one mode from its first round to its last.
 */
export async function applyRuleSet(
  tx: Tx,
  input: {
    groupId: string;
    version: number;
    previous: RuleSetParams;
    next: RuleSetParams;
    proposalId: string;
  },
): Promise<{ effectiveFromRoundId: string | null; effectiveFromRoundNumber: number | null }> {
  const none = { effectiveFromRoundId: null, effectiveFromRoundNumber: null };
  await lockGroup(tx, input.groupId);
  const cycle = await currentCycle(tx, input.groupId);
  if (!cycle) return none;
  const credited = await tx.ledgerTransaction.findMany({
    where: {
      groupId: input.groupId,
      type: { not: 'EVENT' },
      roundId: { in: cycle.rounds.filter((r) => r.status === 'SCHEDULED').map((r) => r.id) },
    },
    select: { roundId: true },
  });
  const withCredits = new Set(credited.map((entry) => entry.roundId));
  const target = ruleChangeTargetRound(
    cycle.rounds.map((round) => ({
      number: round.number,
      opened: round.status !== 'SCHEDULED',
      hasCredits: withCredits.has(round.id),
    })),
  );
  if (!target.ok || target.nextCycle) return none;
  const first = cycle.rounds.find((round) => round.number === target.roundNumber)!;
  const later = cycle.rounds.filter((round) => round.number >= target.roundNumber);
  await tx.round.updateMany({
    where: { id: { in: later.map((round) => round.id) } },
    data: { ruleSetVersion: input.version },
  });

  const { previous, next } = input;
  const redate =
    previous.frequency !== next.frequency ||
    (next.frequency === 'CUSTOM' && previous.customPeriodMinutes !== next.customPeriodMinutes) ||
    previous.payoutTime.hour !== next.payoutTime.hour ||
    previous.payoutTime.minute !== next.payoutTime.minute ||
    JSON.stringify(previous.payoutTime.monthlyAnchor) !==
      JSON.stringify(next.payoutTime.monthlyAnchor);
  const before = cycle.rounds.find((round) => round.number === target.roundNumber - 1);
  if (redate && before) {
    const segment = rescheduleFromRound({
      fromRound: target.roundNumber,
      previousPayoutAt: before.payoutAt,
      frequency: next.frequency,
      customPeriodMinutes: next.customPeriodMinutes,
      payoutTime: next.payoutTime,
      now: clock.now(),
    });
    for (const round of later) {
      const dates = roundDatesInSegments([segment], round.number);
      await tx.round.update({
        where: { id: round.id },
        data: { dueAt: dates.dueAt, payoutAt: dates.payoutAt },
      });
      // D16.3: what is due at this round (an installment, a served leaver's contribution) keeps
      // the round's deadline.
      await tx.obligation.updateMany({
        where: {
          roundId: round.id,
          kind: { in: ['LOAN_INSTALLMENT', 'CONTRIBUTION', 'SOLIDARITY'] },
          status: 'DUE',
        },
        data: { dueAt: dates.dueAt },
      });
    }
  }
  return { effectiveFromRoundId: first.id, effectiveFromRoundNumber: first.number };
}

/**
 * R12.3, D13.4: a member leaves mid-cycle or is removed (their membership is already LEFT or
 * REMOVED). Served: they keep owing their contributions to the rounds still to come. Not served:
 * they lose their round and what they still owed for the rounds, and get back the contributions
 * they paid, from the general fund as far as it can lend, the rest shared by the remaining
 * members. In both cases their whole loan balance becomes due and their due debts are taken from
 * what the group owes them.
 */
export async function settleExit(
  tx: Tx,
  input: {
    groupId: string;
    membershipId: string;
    reason: 'EARLY_EXIT' | 'REMOVED';
    proposalId: string;
  },
): Promise<void> {
  await lockGroup(tx, input.groupId);
  const cycle = await currentCycle(tx, input.groupId);
  if (!cycle) return;
  const now = clock.now();
  const leaver = input.membershipId;

  // A loan asked and not yet sent stops here; its installments were never owed.
  await tx.loan.updateMany({
    where: { groupId: input.groupId, membershipId: leaver, status: 'REQUESTED' },
    data: { status: 'REJECTED', decidedAt: now },
  });
  const unsent = await tx.loan.findMany({
    where: {
      groupId: input.groupId,
      membershipId: leaver,
      status: 'APPROVED',
      OR: [{ disbursementId: null }, { disbursement: { status: 'FAILED' } }],
    },
    select: { id: true },
  });
  if (unsent.length > 0) {
    const ids = unsent.map((loan) => loan.id);
    await tx.loan.updateMany({ where: { id: { in: ids } }, data: { status: 'EXPIRED' } });
    await tx.obligation.updateMany({
      where: { loanId: { in: ids }, status: 'DUE' },
      data: { status: 'CANCELLED' },
    });
  }

  const paying = await tx.paymentIntent.findMany({
    where: { groupId: input.groupId, membershipId: leaver, status: { in: [...OPEN_PAYMENT] } },
    select: { obligationIds: true },
  });
  const reserved = new Set(paying.flatMap((intent) => intent.obligationIds));
  const owed = (
    await tx.obligation.findMany({
      where: { groupId: input.groupId, membershipId: leaver, status: 'DUE' },
      include: { loan: { select: { status: true, disbursement: { select: { status: true } } } } },
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
    })
  ).filter((row) => !reserved.has(row.id));
  const inFlight = (row: (typeof owed)[number]) =>
    row.kind === 'LOAN_INSTALLMENT' &&
    (row.loan?.status === 'APPROVED' ||
      [...OPEN_PAYMENT].includes(row.loan?.disbursement?.status as (typeof OPEN_PAYMENT)[number]));
  const debts = owed.filter((row) => (DEBT_KINDS as readonly string[]).includes(row.kind));

  const paid = await tx.obligation.findMany({
    where: {
      groupId: input.groupId,
      membershipId: leaver,
      kind: 'CONTRIBUTION',
      status: { in: ['PAID', 'SETTLED'] },
      round: { cycleId: cycle.id },
    },
    select: { amount: true },
  });
  const chain = await readChain(tx, input.groupId);
  const balances = computeBalances(chain);
  const payable = payableAccount(leaver);
  const members = await tx.membership.findMany({
    where: { groupId: input.groupId, status: { in: ['ACTIVE', 'LEAVING'] } },
    select: { id: true },
  });
  const active = new Set(members.map((member) => member.id));
  const remaining = [
    ...cycle.rotation.filter((id) => active.has(id) && id !== leaver),
    ...members.map((m) => m.id).filter((id) => !cycle.rotation.includes(id) && id !== leaver),
  ];
  const scheduled = cycle.rounds.filter((round) => round.status === 'SCHEDULED');
  const served = cycle.rounds.some(
    (round) => round.beneficiaryMembershipId === leaver && round.status !== 'SCHEDULED',
  );
  const result = exitSettlement({
    served,
    contributionsPaidThisCycle: sumFcfa(paid.map((row) => row.amount)),
    availableForLoans: availableForLoans({ summary: summarizeBalances(balances) }),
    leaverPayableBalance: Math.max(0, naturalBalance(payable, balances.get(payable) ?? 0)),
    leaverDebts: debts
      .filter((row) => row.kind !== 'LOAN_INSTALLMENT' && row.dueAt <= now)
      .map((row) => ({
        id: row.id,
        kind: row.kind as (typeof DEBT_KINDS)[number],
        amount: row.amount,
        dueAt: row.dueAt,
      })),
    leaverLoanInstallments: debts
      .filter((row) => row.kind === 'LOAN_INSTALLMENT')
      .map((row) => ({
        id: row.id,
        amount: row.amount,
        dueAt: row.dueAt,
        ...(inFlight(row) ? { loanInFlight: true } : {}),
      })),
    remainingMembershipIds: remaining,
    nextRoundDueAt: scheduled[0]?.dueAt ?? now,
    now,
  });

  if (result.kind === 'NOT_SERVED') {
    // They lose their round: what they still owed for the rounds is cancelled.
    await tx.obligation.updateMany({
      where: {
        id: {
          in: owed
            .filter((row) => ['CONTRIBUTION', 'SOLIDARITY', 'SHORTFALL_SHARE'].includes(row.kind))
            .map((row) => row.id),
        },
        status: 'DUE',
      },
      data: { status: 'CANCELLED' },
    });
    if (result.fromFund > 0) {
      await appendLedgerEntry(tx, input.groupId, {
        type: 'LEAVER_REFUND',
        occurredAt: now.toISOString(),
        roundId: null,
        membershipId: leaver,
        refType: 'Proposal',
        refId: input.proposalId,
        descriptionFr: 'Cotisations rendues au membre sortant',
        descriptionEn: 'Contributions returned to the leaving member',
        metadata: { refund: result.refund, shortfall: result.shortfall },
        postings: leaverRefundPostings({ membershipId: leaver, amount: result.fromFund }),
      });
    }
    if (result.shortfallShares.length > 0) {
      await tx.obligation.createMany({
        data: result.shortfallShares.map((share) => ({
          groupId: input.groupId,
          membershipId: share.membershipId,
          kind: 'SHORTFALL_SHARE' as const,
          amount: share.amount,
          dueAt: share.dueAt,
          creditorMembershipId: leaver,
        })),
      });
    }
    if (cycle.rotation.includes(leaver)) {
      const order = removeFromRotation(cycle.rotation, leaver);
      await tx.cycle.update({ where: { id: cycle.id }, data: { rotation: order } });
      // Later rounds move up; the last one has nobody left to receive it.
      const last = scheduled.at(-1);
      for (const round of scheduled) {
        if (round.id === last?.id) continue;
        if (cycle.mode === 'FIXED') {
          await tx.round.update({
            where: { id: round.id },
            data: { beneficiaryMembershipId: order[round.number - 1] ?? null },
          });
        }
      }
      if (last) {
        await tx.ruleSet.updateMany({
          where: { effectiveFromRoundId: last.id },
          data: { effectiveFromRoundId: null },
        });
        // A round with obligations or ledger rows cannot be deleted: it is closed without a
        // beneficiary instead (the scans only open SCHEDULED rounds) and what is still owed on it
        // is cancelled.
        const dependents =
          (await tx.obligation.count({ where: { roundId: last.id } })) +
          (await tx.ledgerTransaction.count({ where: { roundId: last.id } }));
        if (dependents === 0) {
          await tx.round.delete({ where: { id: last.id } });
        } else {
          await tx.obligation.updateMany({
            where: { roundId: last.id, status: 'DUE' },
            data: { status: 'CANCELLED' },
          });
          await tx.round.update({
            where: { id: last.id },
            data: { status: 'CLOSED', beneficiaryMembershipId: null },
          });
        }
      }
      await appendLedgerEntry(tx, input.groupId, {
        type: 'EVENT',
        occurredAt: now.toISOString(),
        roundId: null,
        membershipId: null,
        refType: 'Proposal',
        refId: input.proposalId,
        descriptionFr: 'Ordre des tours mis à jour après un départ',
        descriptionEn: 'Round order updated after a member left',
        metadata: {
          event: 'ROTATION_CHANGED',
          cycleNumber: cycle.number,
          order,
          proposalId: input.proposalId,
        },
        postings: [],
      });
    }
  } else if (scheduled.length > 0) {
    // Served: they still owe their contribution to each round to come.
    const params = await getCurrentParams(input.groupId, tx);
    for (const round of scheduled) {
      const drafts = roundObligations({
        contributionAmount: params.contributionAmount,
        solidarityContribution: params.solidarityContribution,
        round: {
          id: round.id,
          dueAt: round.dueAt,
          beneficiaryMembershipId: round.beneficiaryMembershipId,
        },
        activeMembershipIds: [leaver],
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
    }
  }

  // D13.4: the whole loan balance is due now; then due debts come out of the payable (R5.3).
  if (result.acceleratedInstallmentIds.length > 0) {
    await tx.obligation.updateMany({
      where: { id: { in: result.acceleratedInstallmentIds }, status: 'DUE' },
      data: { dueAt: now },
    });
  }
  await settleDueDebts(tx, { groupId: input.groupId, membershipId: leaver, now });
}
