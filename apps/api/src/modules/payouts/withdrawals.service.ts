// Member withdrawals (R5.2-R5.6, R13.5, D18.1). The service rechecks the exact server-built card
// at confirmation, records the in-flight send before contacting the provider, and only completes
// it after the provider confirms.
import { randomUUID } from 'node:crypto';
import {
  accountBalance,
  activeHold,
  availableToWithdraw,
  completionType,
  disbursementCompletedPostings,
  disbursementRefundedPostings,
  disbursementReturnedPostings,
  dueDebtsTotal,
  loanRefundSettlement,
  checkLedger,
  loanSentPostings,
  MIN_WITHDRAWAL,
  lockedPayoutCredits,
  payableAccount,
  resolveFee,
  validateWithdrawal,
  withdrawalSentPostings,
} from '@njangi/rules';
import { formatDateTime, formatXAF, maskNumber } from '@njangi/shared';
import { getEnv } from '../../config/env';
import { clock } from '../../lib/clock';
import { getPrisma, type Db, type Prisma } from '../../lib/prisma';
import { ui } from '../../lib/texts';
import { authorizeGroup, type AuthActor } from '../../permissions';
import { appendLedgerEntry } from '../ledger';
import { sealClawbackReleases } from '../ledger/ledger.correction';
import { completePendingAction, createPendingAction, type ActionOrigin } from '../pending-actions';
import { getPaymentProvider, isSendClaim, providerRefused, sendClaim } from '../providers';
import { dispatchJob } from '../../jobs/dispatch';
import { settleDueDebts } from './payouts.settlement';
import { payoutError } from './payouts.errors';
import { componentLogger } from '../../lib/logger';
import { audit } from '../audit/audit.service';
import { readChain } from '../statements/ledger-read';

const log = componentLogger('payouts');

/** The ledger texts of a send, by what it pays. */
const SEND_TEXTS = {
  WITHDRAWAL: {
    completed: { descriptionFr: 'Retrait effectué', descriptionEn: 'Withdrawal completed' },
    returned: {
      descriptionFr: 'Retrait refusé, solde rétabli',
      descriptionEn: 'Withdrawal failed, balance restored',
    },
  },
  LOAN: {
    completed: { descriptionFr: 'Prêt versé', descriptionEn: 'Loan paid out' },
    returned: {
      descriptionFr: 'Envoi du prêt refusé, montant rétabli',
      descriptionEn: 'Loan send failed, amount restored',
    },
  },
  SOLIDARITY: {
    completed: {
      descriptionFr: 'Soutien de secours versé',
      descriptionEn: 'Solidarity support paid',
    },
    returned: {
      descriptionFr: 'Envoi du soutien refusé, caisse de secours rétablie',
      descriptionEn: 'Support send failed, solidarity fund restored',
    },
  },
} as const;

function feeSchedule() {
  const configured = getEnv().FEE_SCHEDULE;
  return {
    collection: [
      { upTo: null, fixed: configured.collection, ratePermille: configured.collectionPermille },
    ],
    disbursement: [
      { upTo: null, fixed: configured.disbursement, ratePermille: configured.disbursementPermille },
    ],
  };
}

/** Everything a withdrawal decision reads: the member's payable, locked credits, debts and holds. */
async function loadMoneyState(db: Db, input: { userId: string; groupId: string }) {
  const access = await authorizeGroup(input.userId, input.groupId, 'group.withdrawals.create', db);
  const member = await db.membership.findUniqueOrThrow({
    where: { id: access.membership.id },
    include: { user: { include: { paymentNumbers: { where: { activeTo: null }, take: 1 } } } },
  });
  const params = await db.ruleSet.findFirstOrThrow({
    where: { groupId: input.groupId },
    orderBy: { version: 'desc' },
  });
  const hasPreviousNumber = member.user.paymentNumbers[0]
    ? (await db.paymentNumber.count({
        where: {
          userId: member.userId,
          activeTo: { not: null },
          activeFrom: { lte: member.user.paymentNumbers[0].activeFrom },
        },
      })) > 0
    : false;
  const hold = activeHold({
    numberChangedAt: hasPreviousNumber ? (member.user.paymentNumbers[0]?.activeFrom ?? null) : null,
    pinResetAt: member.user.pinResetAt,
    holdHours: (params.params as { numberChangeHoldHours: number }).numberChangeHoldHours,
    now: clock.now(),
  });
  const latestCheck = await db.reconciliationRun.findFirst({
    where: {
      providerAccount: (
        await db.group.findUniqueOrThrow({
          where: { id: input.groupId },
          select: { providerAccount: true },
        })
      ).providerAccount,
    },
    orderBy: { ranAt: 'desc' },
    select: { status: true },
  });
  const openDisbursements = await db.disbursement.count({
    where: {
      membershipId: member.id,
      purpose: 'WITHDRAWAL',
      status: { in: ['CREATED', 'PENDING', 'EXPIRED'] },
    },
  });
  const debts = await db.obligation.findMany({
    where: {
      groupId: input.groupId,
      membershipId: member.id,
      status: 'DUE',
      kind: { in: ['BID', 'FINE', 'CORRECTION', 'LOAN_INSTALLMENT'] },
    },
    include: { loan: { select: { status: true, disbursement: { select: { status: true } } } } },
    orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
  });
  const ledger = await db.ledgerTransaction.findMany({
    where: { groupId: input.groupId },
    include: { postings: true },
    orderBy: { seq: 'asc' },
  });
  const payable = payableAccount(member.id);
  const payableBalance = accountBalance(
    payable,
    ledger.flatMap((entry) => entry.postings),
  );
  const contributionRows = await db.obligation.findMany({
    where: {
      groupId: input.groupId,
      creditorMembershipId: member.id,
      kind: 'CONTRIBUTION',
      status: { in: ['PAID', 'SETTLED'] },
    },
    select: { id: true, round: { select: { payoutAt: true } } },
  });
  const contributionUnlockAt = new Map(
    contributionRows.map((row) => [row.id, row.round?.payoutAt ?? new Date(0)] as const),
  );
  // R5.2: a pot assigned at the close of the bids is locked until its round's payout time too.
  const potRounds = await db.round.findMany({
    where: { groupId: input.groupId, beneficiaryMembershipId: member.id },
    select: { id: true, payoutAt: true },
  });
  const credits = lockedPayoutCredits({
    payable,
    entries: ledger,
    contributionUnlockAt,
    potUnlockAt: new Map(potRounds.map((round) => [round.id, round.payoutAt] as const)),
  });
  const withdrawalDebts = debts.map((debt) => ({
    id: debt.id,
    kind: debt.kind as 'BID' | 'FINE' | 'CORRECTION' | 'LOAN_INSTALLMENT',
    amount: debt.amount,
    dueAt: debt.dueAt,
    loanInFlight:
      debt.kind === 'LOAN_INSTALLMENT' &&
      (debt.loan?.status === 'APPROVED' ||
        ['CREATED', 'PENDING', 'EXPIRED'].includes(debt.loan?.disbursement?.status ?? '')),
  }));
  return {
    access,
    member,
    payableBalance,
    credits,
    debts: withdrawalDebts,
    hold,
    latestCheck,
    withdrawalInProgress: openDisbursements > 0,
  };
}

/**
 * The member's own money in the group, for the money screen and the agent: what can be withdrawn
 * now, what is locked until a payout time, the debts due and any hold. Same figures as the
 * withdrawal check uses.
 */
export async function readMyMoney(
  userId: string,
  groupId: string,
  db: Db = getPrisma(),
  now: Date = clock.now(),
) {
  const state = await loadMoneyState(db, { userId, groupId });
  const figures = availableToWithdraw({
    payableBalance: state.payableBalance,
    credits: state.credits,
    now,
    feeSchedule: feeSchedule(),
    debts: state.debts,
  });
  return {
    available: figures.available,
    locked: figures.locked,
    unlocksAt: figures.unlocksAt,
    debtsDue: dueDebtsTotal(state.debts, now),
    hold: state.hold,
    withdrawalsPaused: state.latestCheck?.status === 'ALERT',
    withdrawalInProgress: state.withdrawalInProgress,
  };
}

async function loadWithdrawal(
  db: Db,
  input: { userId: string; groupId: string; amount: number | 'ALL'; lang?: 'fr' | 'en' },
) {
  const state = await loadMoneyState(db, input);
  const { access, member, payableBalance, credits, hold, latestCheck } = state;
  const withdrawalDebts = state.debts;
  const fee = feeSchedule();
  const withdrawal = validateWithdrawal({
    amount: input.amount,
    payableBalance,
    credits,
    feeSchedule: fee,
    now: clock.now(),
    hold,
    reconciliationStatus: latestCheck?.status ?? null,
    withdrawalInProgress: state.withdrawalInProgress,
    hasActivePaymentNumber: member.user.paymentNumbers.length === 1,
    debts: withdrawalDebts,
  });
  if (!withdrawal.ok) {
    const amountIn = (amount: number) => ({
      fr: formatXAF(amount, 'fr'),
      en: formatXAF(amount, 'en'),
    });
    switch (withdrawal.code) {
      case 'HOLD_ACTIVE':
        throw payoutError('HOLD_ACTIVE', {
          params: {
            date: {
              fr: formatDateTime(withdrawal.until, 'fr'),
              en: formatDateTime(withdrawal.until, 'en'),
            },
          },
          details: {
            holdEnds: formatDateTime(withdrawal.until, input.lang ?? 'fr'),
            until: withdrawal.until.toISOString(),
          },
        });
      case 'NOTHING_TO_WITHDRAW':
        throw payoutError('NOTHING_TO_WITHDRAW', { params: { minimum: amountIn(MIN_WITHDRAWAL) } });
      case 'BELOW_MINIMUM_WITHDRAWAL':
        throw payoutError('BELOW_MINIMUM_WITHDRAWAL', {
          params: { minimum: amountIn(withdrawal.minimum) },
        });
      case 'ABOVE_AVAILABLE':
        throw payoutError('ABOVE_AVAILABLE', {
          params: { available: amountIn(withdrawal.available) },
        });
      default:
        throw payoutError(withdrawal.code);
    }
  }
  const number = member.user.paymentNumbers[0];
  if (!number) throw payoutError('NO_ACTIVE_PAYMENT_NUMBER');
  return {
    access,
    member,
    number,
    withdrawal,
    feeSchedule: fee,
    payableBalance,
    credits,
    debts: withdrawalDebts,
    hold,
    latestCheck,
  };
}

export async function withdrawalPreview(
  db: Db,
  input: { userId: string; groupId: string; amount: number | 'ALL'; lang: 'fr' | 'en' },
) {
  const loaded = await loadWithdrawal(db, input);
  const act = ui((copy) => copy.confirmation.actions.withdraw.title);
  const title = act;
  const button = ui((copy) => copy.confirmation.actions.withdraw.button, {
    amount: formatXAF(loaded.withdrawal.amount, input.lang),
  });
  const feeLine = ui((copy) => copy.withdraw.fee);
  const destination = ui((copy) => copy.withdraw.to, {
    operator: loaded.number.operator === 'ORANGE' ? 'Orange' : 'MTN',
    number: maskNumber(loaded.number.number),
  });
  return {
    ...loaded,
    preview: {
      title,
      lines: [
        { label: act, amount: loaded.withdrawal.amount },
        { label: feeLine, amount: loaded.withdrawal.feeEstimate },
      ],
      total: loaded.withdrawal.amount + loaded.withdrawal.feeEstimate,
      notes: [destination],
      confirmLabel: button,
    },
  };
}

export async function createWithdrawal(
  tx: Prisma.TransactionClient,
  input: {
    groupId: string;
    membershipId: string;
    phone: string;
    amount: number;
    feeEstimated: number;
  },
) {
  const id = randomUUID();
  const disbursement = await tx.disbursement.create({
    data: {
      id,
      groupId: input.groupId,
      membershipId: input.membershipId,
      purpose: 'WITHDRAWAL',
      amount: input.amount,
      feeEstimated: input.feeEstimated,
      phoneSnapshot: input.phone,
      provider: getEnv().PAYMENT_PROVIDER,
      status: 'CREATED',
    },
  });
  const sent = withdrawalSentPostings({
    operationId: id,
    membershipId: input.membershipId,
    amount: input.amount,
    feeEstimated: input.feeEstimated,
  });
  await appendLedgerEntry(tx, input.groupId, {
    type: 'DISBURSEMENT_SENT',
    occurredAt: clock.now().toISOString(),
    roundId: null,
    membershipId: input.membershipId,
    refType: 'Disbursement',
    refId: id,
    descriptionFr: 'Retrait envoyé',
    descriptionEn: 'Withdrawal sent',
    metadata: sent.metadata,
    postings: sent.postings,
  });
  return disbursement;
}

export async function createLoanDisbursement(
  tx: Prisma.TransactionClient,
  input: {
    groupId: string;
    loanId: string;
    membershipId: string;
    phone: string;
    principal: number;
    interest: number;
    feeEstimated: number;
  },
) {
  const id = randomUUID();
  const disbursement = await tx.disbursement.create({
    data: {
      id,
      groupId: input.groupId,
      membershipId: input.membershipId,
      purpose: 'LOAN',
      amount: input.principal,
      feeEstimated: input.feeEstimated,
      phoneSnapshot: input.phone,
      provider: getEnv().PAYMENT_PROVIDER,
      status: 'CREATED',
    },
  });
  await tx.loan.update({ where: { id: input.loanId }, data: { disbursementId: id } });
  const sent = loanSentPostings({
    operationId: id,
    membershipId: input.membershipId,
    principal: input.principal,
    interest: input.interest,
    feeEstimated: input.feeEstimated,
  });
  await appendLedgerEntry(tx, input.groupId, {
    type: 'DISBURSEMENT_SENT',
    occurredAt: clock.now().toISOString(),
    roundId: null,
    membershipId: input.membershipId,
    refType: 'Disbursement',
    refId: id,
    descriptionFr: 'Prêt envoyé',
    descriptionEn: 'Loan disbursement sent',
    metadata: sent.metadata,
    postings: sent.postings,
  });
  return disbursement;
}

export async function submitDisbursement(id: string): Promise<void> {
  const db = getPrisma();
  const row = await db.disbursement.findUnique({ where: { id } });
  if (!row || row.status !== 'CREATED' || row.providerRef) return;
  // Rule 8: money is sent once. The row is claimed first, so a second run of this job never
  // reaches the operator, and a send whose answer was lost is never repeated blindly.
  const claim = sendClaim();
  const claimed = await db.disbursement.updateMany({
    where: { id, status: 'CREATED', providerRef: null },
    data: { providerRef: claim },
  });
  if (claimed.count !== 1) return;
  try {
    const started = await getPaymentProvider().disburse({
      amount: row.amount,
      phone: row.phoneSnapshot,
      externalRef: row.id,
      description: `NjangiTrust withdrawal ${row.id}`,
    });
    await db.disbursement.updateMany({
      where: { id, providerRef: claim },
      data: { providerRef: started.providerRef, status: 'PENDING' },
    });
    await scheduleDisbursementPoll(id, 5_000);
  } catch (error) {
    if (providerRefused(error)) {
      // The operator said no before sending anything: the money goes back to the member.
      await returnFailedDisbursement(id);
      return;
    }
    log.error(
      { disbursementId: id, errorName: error instanceof Error ? error.name : 'Error' },
      'send requested but its answer was lost; not sent again, needs a check with the operator',
    );
    await scheduleDisbursementPoll(id, 10 * 60_000);
  }
}

export async function pollDisbursement(id: string): Promise<void> {
  const db = getPrisma();
  const row = await db.disbursement.findUnique({ where: { id } });
  if (!row || !['CREATED', 'PENDING', 'EXPIRED'].includes(row.status)) return;
  if (!row.providerRef) {
    await submitDisbursement(id);
    return;
  }
  if (isSendClaim(row.providerRef)) {
    // Sent, answer lost: the money stays in flight (never sent twice) until a manual check.
    await db.disbursement.updateMany({
      where: { id, status: 'CREATED' },
      data: { status: 'EXPIRED' },
    });
    return;
  }
  let providerStatus: Awaited<
    ReturnType<ReturnType<typeof getPaymentProvider>['getDisbursementStatus']>
  >;
  try {
    providerStatus = await getPaymentProvider().getDisbursementStatus(row.providerRef);
  } catch (error) {
    log.warn(
      { disbursementId: id, errorName: error instanceof Error ? error.name : 'Error' },
      'provider disbursement status check failed; retrying',
    );
    await scheduleDisbursementPoll(id, 60_000);
    return;
  }
  const age = clock.nowMs() - row.createdAt.getTime();
  if (providerStatus.status === 'PENDING') {
    if (age >= 10 * 60_000)
      await db.disbursement.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });
    await scheduleDisbursementPoll(
      id,
      age < 10 * 60_000 ? 30_000 : age < 24 * 60 * 60_000 ? 60 * 60_000 : 24 * 60 * 60_000,
    );
    return;
  }
  if (providerStatus.status === 'FAILED') {
    await returnFailedDisbursement(id);
    return;
  }
  await completeDisbursement(id, providerStatus.fee);
}

async function completeDisbursement(id: string, providerFee?: number) {
  const db = getPrisma();
  const now = clock.now();
  const amount = await db.$transaction(async (tx) => {
    const row = await tx.disbursement.findUnique({ where: { id }, include: { loan: true } });
    if (!row || row.status === 'SUCCESSFUL') return null;
    const fee = resolveFee({
      providerFee,
      schedule: feeSchedule(),
      kind: 'DISBURSEMENT',
      // A solidarity send's fee was estimated on the voted amount, which includes it.
      amount: row.purpose === 'SOLIDARITY' ? row.amount + row.feeEstimated : row.amount,
    });
    const changed = await tx.disbursement.updateMany({
      where: { id, status: { in: ['CREATED', 'PENDING', 'EXPIRED'] } },
      data: { status: 'SUCCESSFUL', feeActual: fee.fee, settledAt: now },
    });
    if (changed.count !== 1) return null;
    const sent = await tx.ledgerTransaction.findFirst({
      where: {
        groupId: row.groupId,
        refType: 'Disbursement',
        refId: id,
        type: 'DISBURSEMENT_SENT',
      },
      include: { postings: true },
    });
    if (!sent) throw new Error('Withdrawal send is missing from the ledger');
    const completed = disbursementCompletedPostings({
      operationId: id,
      amount: row.amount,
      feeEstimated: row.feeEstimated,
      feeActual: fee.fee,
      feeSource: fee.feeSource,
    });
    await appendLedgerEntry(tx, row.groupId, {
      type: completionType(row.purpose),
      occurredAt: now.toISOString(),
      roundId: null,
      membershipId: row.membershipId,
      refType: 'Disbursement',
      refId: id,
      ...SEND_TEXTS[row.purpose].completed,
      metadata: { ...completed.metadata, amount: row.amount, purpose: row.purpose },
      postings: completed.postings,
    });
    if (row.purpose === 'LOAN' && row.loan) {
      await tx.loan.update({ where: { id: row.loan.id }, data: { status: 'DISBURSED' } });
    }
    if (row.purpose === 'SOLIDARITY') {
      await tx.solidarityRequest.updateMany({
        where: { disbursementId: id, status: 'APPROVED' },
        data: { status: 'PAID' },
      });
    }
    return row.amount;
  });
  if (amount === null) return;
  const action = await db.pendingAction.findFirst({
    where: { resultRef: id, status: 'CONFIRMED' },
    select: { id: true },
  });
  if (action)
    await completePendingAction(action.id, {
      status: 'DONE',
      resultRef: id,
      summary: {
        fr: `Retrait de ${formatXAF(amount, 'fr')} confirmé`,
        en: `Withdrawal of ${formatXAF(amount, 'en')} confirmed`,
      },
    });
}

async function returnFailedDisbursement(id: string) {
  const db = getPrisma();
  const now = clock.now();
  const returned = await db.$transaction(async (tx) => {
    const row = await tx.disbursement.findUnique({ where: { id }, include: { loan: true } });
    if (!row || row.status === 'FAILED') return null;
    const changed = await tx.disbursement.updateMany({
      where: { id, status: { in: ['CREATED', 'PENDING', 'EXPIRED'] } },
      data: { status: 'FAILED', settledAt: now },
    });
    if (changed.count !== 1) return null;
    const sent = await tx.ledgerTransaction.findFirst({
      where: {
        groupId: row.groupId,
        refType: 'Disbursement',
        refId: id,
        type: 'DISBURSEMENT_SENT',
      },
      include: { postings: true },
    });
    if (!sent) throw new Error('Withdrawal send is missing from the ledger');
    const returnedEntry = await appendLedgerEntry(tx, row.groupId, {
      type: 'DISBURSEMENT_RETURNED',
      occurredAt: now.toISOString(),
      roundId: null,
      membershipId: row.membershipId,
      refType: 'Disbursement',
      refId: id,
      ...SEND_TEXTS[row.purpose].returned,
      metadata: { sentSeq: sent.seq },
      postings: disbursementReturnedPostings(
        sent.postings.map((posting) => ({ account: posting.account, amount: posting.amount })),
      ),
    });
    if (row.purpose === 'LOAN' && row.loan) {
      await tx.loan.update({ where: { id: row.loan.id }, data: { status: 'APPROVED' } });
    } else if (row.purpose === 'SOLIDARITY') {
      // The money is back in the fund: the request failed, and the clawbacks this payout had
      // caused are released at once (owner Q1, Q3).
      await tx.solidarityRequest.updateMany({
        where: { disbursementId: id, status: 'APPROVED' },
        data: { status: 'FAILED' },
      });
      const credited = await sealClawbackReleases(tx, {
        groupId: row.groupId,
        returnedSeq: returnedEntry.seq,
        now,
      });
      for (const membershipId of credited) {
        await settleDueDebts(tx, { groupId: row.groupId, membershipId, now });
      }
    } else {
      await settleDueDebts(tx, { groupId: row.groupId, membershipId: row.membershipId, now });
    }
    return row;
  });
  if (!returned) return;
  const action = await db.pendingAction.findFirst({
    where: { resultRef: id, status: 'CONFIRMED' },
    select: { id: true },
  });
  if (action)
    await completePendingAction(action.id, {
      status: 'FAILED',
      failureCode: 'DISBURSEMENT_FAILED',
      failureText: {
        fr: 'Le retrait a été refusé. Ton argent est de nouveau disponible.',
        en: 'The withdrawal failed. Your money is available again.',
      },
    });
}

/**
 * D22.1: record an operator-confirmed reversal of a completed disbursement. This is deliberately
 * separate from provider status polling: the operator must supply the fee the provider kept.
 * The row lock and ledger lookup make repeated operator callbacks idempotent.
 */
export async function recordDisbursementRefund(input: {
  disbursementId: string;
  feeKept: number;
  reason: string;
}): Promise<{ alreadyRecorded: boolean }> {
  const db = getPrisma();
  const now = clock.now();
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Disbursement" WHERE "id" = ${input.disbursementId}::uuid FOR UPDATE`;
    const row = await tx.disbursement.findUnique({
      where: { id: input.disbursementId },
      include: { loan: true, solidarityRequest: true },
    });
    if (!row) throw payoutError('ACTION_NOT_AVAILABLE');
    const prior = await tx.ledgerTransaction.findFirst({
      where: {
        groupId: row.groupId,
        refType: 'Disbursement',
        refId: row.id,
        type: 'DISBURSEMENT_REFUNDED',
      },
      select: { id: true, metadata: true },
    });
    if (prior) {
      const metadata = prior.metadata as { feeKept?: unknown };
      if (metadata.feeKept !== input.feeKept) throw payoutError('ACTION_NOT_AVAILABLE');
      return { alreadyRecorded: true };
    }
    if (row.status !== 'SUCCESSFUL' || row.feeActual === null)
      throw payoutError('ACTION_NOT_AVAILABLE');
    if (input.feeKept > row.feeActual) throw payoutError('INVALID_AMOUNT');
    const sent = await tx.ledgerTransaction.findFirst({
      where: {
        groupId: row.groupId,
        refType: 'Disbursement',
        refId: row.id,
        type: 'DISBURSEMENT_SENT',
      },
      include: { postings: true },
    });
    const completed = await tx.ledgerTransaction.findFirst({
      where: {
        groupId: row.groupId,
        refType: 'Disbursement',
        refId: row.id,
        type: completionType(row.purpose),
      },
      include: { postings: true },
    });
    if (!sent || !completed) throw payoutError('ACTION_NOT_AVAILABLE');

    let paidBack = 0;
    let installmentIds: string[] = [];
    if (row.purpose === 'LOAN') {
      if (!row.loan) throw payoutError('ACTION_NOT_AVAILABLE');
      const installments = await tx.obligation.findMany({
        where: { loanId: row.loan.id },
        select: { id: true, amount: true, status: true },
      });
      const openPayments = await tx.paymentIntent.findMany({
        where: {
          groupId: row.groupId,
          membershipId: row.membershipId,
          status: { in: ['CREATED', 'PENDING', 'EXPIRED'] },
        },
        select: { obligationIds: true },
      });
      const inPayment = new Set(openPayments.flatMap((payment) => payment.obligationIds));
      const settlement = loanRefundSettlement({
        totalDue: row.loan.totalDue,
        installments: installments.map((installment) => ({
          ...installment,
          inPendingPayment: inPayment.has(installment.id),
        })),
      });
      if (!settlement.ok) throw payoutError('INSTALLMENT_PAYMENT_PENDING');
      paidBack = settlement.paidBack;
      installmentIds = settlement.cancelInstallmentIds;
    }

    const refunded = disbursementRefundedPostings({
      sent: { postings: sent.postings, metadata: sent.metadata as Record<string, unknown> },
      completed: {
        postings: completed.postings,
        metadata: completed.metadata as Record<string, unknown>,
      },
      completedSeq: completed.seq,
      feeKept: input.feeKept,
      ...(row.purpose === 'LOAN' ? { paidBack } : {}),
    });
    const entry = await appendLedgerEntry(tx, row.groupId, {
      type: 'DISBURSEMENT_REFUNDED',
      occurredAt: now.toISOString(),
      roundId: null,
      membershipId: row.membershipId,
      refType: 'Disbursement',
      refId: row.id,
      descriptionFr: 'Versement remboursé par l’opérateur',
      descriptionEn: 'Disbursement refunded by the operator',
      metadata: refunded.metadata,
      postings: refunded.postings,
    });
    const changed = await tx.disbursement.updateMany({
      where: { id: row.id, status: 'SUCCESSFUL' },
      data: { status: 'REFUNDED', settledAt: now },
    });
    if (changed.count !== 1) throw payoutError('ACTION_NOT_AVAILABLE');

    if (row.purpose === 'LOAN' && row.loan) {
      await tx.obligation.updateMany({
        where: { id: { in: installmentIds }, status: 'DUE' },
        data: { status: 'CANCELLED' },
      });
      await tx.loan.update({ where: { id: row.loan.id }, data: { status: 'REFUNDED' } });
    } else if (row.purpose === 'SOLIDARITY') {
      await tx.solidarityRequest.updateMany({
        where: { disbursementId: row.id, status: 'PAID' },
        data: { status: 'REFUNDED' },
      });
      const credited = await sealClawbackReleases(tx, {
        groupId: row.groupId,
        returnedSeq: entry.seq,
        now,
      });
      for (const membershipId of credited)
        await settleDueDebts(tx, { groupId: row.groupId, membershipId, now });
    } else {
      await settleDueDebts(tx, { groupId: row.groupId, membershipId: row.membershipId, now });
    }
    const problems = checkLedger(row.groupId, await readChain(tx, row.groupId));
    if (problems.length > 0) throw new Error('Disbursement refund would leave the ledger unsound');
    await audit(
      {
        action: 'payout.disbursement.refunded',
        groupId: row.groupId,
        target: `Disbursement:${row.id}`,
        details: { purpose: row.purpose, feeKept: input.feeKept, reason: input.reason },
        system: true,
      },
      tx,
    );
    return { alreadyRecorded: false };
  });
}

export async function scheduleDisbursementPoll(id: string, delayMs: number) {
  await dispatchJob(
    'disbursements.poll',
    { disbursementId: id },
    { jobId: `disbursement-poll-${id}-${randomUUID()}`, at: new Date(clock.nowMs() + delayMs) },
  );
}

export async function getOwnWithdrawal(userId: string, id: string) {
  const row = await getPrisma().disbursement.findFirst({
    where: { id, purpose: 'WITHDRAWAL', membership: { userId } },
  });
  if (!row) throw payoutError('ACTION_NOT_AVAILABLE');
  return {
    id: row.id,
    amount: row.amount,
    feeEstimated: row.feeEstimated,
    feeActual: row.feeActual,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    settledAt: row.settledAt?.toISOString() ?? null,
  };
}

/** Prepares the withdrawal card (the member confirms it in the app). */
export async function requestWithdrawal(
  actor: AuthActor,
  groupId: string,
  amount: number | 'ALL',
  origin: ActionOrigin = 'UI',
) {
  return createPendingAction({
    userId: actor.userId,
    groupId,
    lang: actor.lang,
    origin,
    type: 'WITHDRAW',
    args: { groupId, amount },
  });
}
