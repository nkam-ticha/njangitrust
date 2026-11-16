// Collection request and settlement (spec 2.6, R3-R4). Routes and tools share this PendingAction.
import { randomUUID } from 'node:crypto';
import {
  isOnTime,
  paymentReceivedPostings,
  preparePayment,
  resolvePaymentParts,
  type LedgerEntry,
  type OpenObligation,
} from '@njangi/rules';
import { formatXAF } from '@njangi/shared';
import { getEnv } from '../../config/env';
import { clock } from '../../lib/clock';
import { componentLogger } from '../../lib/logger';
import { getPrisma, type Db, type Prisma } from '../../lib/prisma';
import { scheduleFee } from '@njangi/rules';
import { appendLedgerEntry } from '../ledger';
import { authorizeGroup, type AuthActor } from '../../permissions';
import { completePendingAction, createPendingAction, type ActionOrigin } from '../pending-actions';
import { getPaymentProvider } from '../providers';
import { paymentError } from './payments.errors';
import { markLoanRepaidWhenClear } from '../loans';
import { settleDueDebts } from '../payouts/payouts.settlement';

const log = componentLogger('payments');

function feeSchedule() {
  const raw = getEnv().FEE_SCHEDULE;
  return {
    collection: [{ upTo: null, fixed: raw.collection, ratePermille: 0 }],
    disbursement: [{ upTo: null, fixed: raw.disbursement, ratePermille: 0 }],
  };
}

async function loadObligations(db: Db, groupId: string, userId: string, ids: string[]) {
  const member = await db.membership.findFirst({
    where: { groupId, userId, status: { in: ['ACTIVE', 'LEAVING'] } },
    select: {
      id: true,
      user: {
        select: {
          paymentNumbers: { where: { activeTo: null }, take: 1, select: { number: true } },
        },
      },
    },
  });
  if (!member) throw paymentError('OBLIGATION_NOT_AVAILABLE');
  const obligations = await db.obligation.findMany({
    where: { id: { in: ids }, groupId, membershipId: member.id },
    include: {
      round: { select: { number: true, cycle: { select: { rotation: true } } } },
      loan: { select: { status: true, disbursement: { select: { status: true } } } },
    },
  });
  if (obligations.length !== ids.length) throw paymentError('OBLIGATION_NOT_AVAILABLE');
  const pending = await db.paymentIntent.findMany({
    where: {
      groupId,
      membershipId: member.id,
      OR: [{ status: { in: ['CREATED', 'PENDING'] } }, { status: 'EXPIRED' }],
      obligationIds: { hasSome: ids },
    },
    select: { obligationIds: true },
  });
  const reserved = new Set(pending.flatMap((p) => p.obligationIds));
  return { member, obligations, reserved };
}

export async function preparePaymentParts(
  db: Db,
  input: { groupId: string; userId: string; obligationIds: string[] },
) {
  const loaded = await loadObligations(db, input.groupId, input.userId, input.obligationIds);
  const selected: OpenObligation[] = loaded.obligations.map((o) => ({
    id: o.id,
    kind: o.kind,
    membershipId: o.membershipId,
    amount: o.amount,
    dueAt: o.dueAt,
    roundId: o.roundId,
    roundNumber: o.round?.number ?? null,
    creditorMembershipId: o.creditorMembershipId,
    status: o.status,
    inPendingPayment: loaded.reserved.has(o.id),
    loanInFlight:
      o.loan?.status === 'APPROVED' ||
      ['CREATED', 'PENDING', 'EXPIRED'].includes(o.loan?.disbursement?.status ?? ''),
  }));
  const prepared = preparePayment({
    payerMembershipId: loaded.member.id,
    obligations: selected,
    feeSchedule: feeSchedule(),
  });
  if (!prepared.ok) {
    if (prepared.code === 'PAYMENT_ALREADY_PENDING') throw paymentError('PAYMENT_ALREADY_PENDING');
    if (prepared.code === 'NOTHING_TO_PAY') throw paymentError('NOTHING_TO_PAY');
    throw paymentError('OBLIGATION_NOT_AVAILABLE');
  }
  // The collection fee comes out of the payment: one that the fee would swallow cannot be booked.
  if (prepared.total <= scheduleFee(feeSchedule(), 'COLLECTION', prepared.total))
    throw paymentError('NOTHING_TO_PAY');
  const activeNumber = loaded.member.user.paymentNumbers[0]?.number;
  if (!activeNumber) throw paymentError('PAYMENT_NUMBER_MISSING');
  return {
    member: loaded.member,
    obligations: loaded.obligations,
    selected,
    prepared,
    phone: activeNumber,
  };
}

export async function paymentPreview(
  db: Db,
  input: { groupId: string; userId: string; obligationIds: string[]; lang: 'fr' | 'en' },
) {
  const result = await preparePaymentParts(db, input);
  const lines = result.prepared.parts.map((part) => {
    const obligation = result.obligations.find((o) => o.id === part.ref)!;
    const label =
      obligation.kind === 'CONTRIBUTION'
        ? {
            fr: `Cotisation, tour ${obligation.round?.number ?? '—'}`,
            en: `Contribution, round ${obligation.round?.number ?? '—'}`,
          }
        : obligation.kind === 'SOLIDARITY'
          ? {
              fr: `Caisse de secours, tour ${obligation.round?.number ?? '—'}`,
              en: `Solidarity fund, round ${obligation.round?.number ?? '—'}`,
            }
          : obligation.kind === 'FINE'
            ? { fr: 'Amende', en: 'Fine' }
            : obligation.kind === 'LOAN_INSTALLMENT'
              ? { fr: 'Échéance de prêt', en: 'Loan installment' }
              : obligation.kind === 'BID'
                ? { fr: 'Enchère', en: 'Bid' }
                : obligation.kind === 'CORRECTION'
                  ? { fr: 'Correction', en: 'Correction debt' }
                  : { fr: 'Dette', en: 'Debt' };
    return { label, amount: part.amount };
  });
  return {
    ...result,
    lines,
    totalText: formatXAF(result.prepared.total, input.lang),
    feeEstimate: scheduleFee(feeSchedule(), 'COLLECTION', result.prepared.total),
  };
}

export async function createPaymentIntent(
  tx: Prisma.TransactionClient,
  input: {
    groupId: string;
    membershipId: string;
    obligationIds: string[];
    phone: string;
    amount: number;
    provider: string;
  },
) {
  const id = randomUUID();
  return tx.paymentIntent.create({
    data: {
      id,
      groupId: input.groupId,
      membershipId: input.membershipId,
      obligationIds: input.obligationIds,
      amount: input.amount,
      phoneSnapshot: input.phone,
      provider: input.provider,
      status: 'CREATED',
    },
  });
}

export async function submitPaymentIntent(id: string): Promise<void> {
  const intent = await getPrisma().paymentIntent.findUnique({ where: { id } });
  if (!intent || intent.status !== 'CREATED') return;
  try {
    const result = await getPaymentProvider().requestPayment({
      amount: intent.amount,
      phone: intent.phoneSnapshot,
      externalRef: intent.id,
      description: `NjangiTrust payment ${intent.id}`,
    });
    await getPrisma().paymentIntent.updateMany({
      where: { id, status: 'CREATED' },
      data: { providerRef: result.providerRef, status: 'PENDING' },
    });
    await schedulePaymentPoll(id, 5_000);
  } catch (error) {
    log.warn(
      { paymentIntentId: id, errorName: error instanceof Error ? error.name : 'Error' },
      'provider collection request failed; retrying with the same idempotency reference',
    );
    await schedulePaymentPoll(id, 10_000);
  }
}

export async function pollPaymentIntent(id: string): Promise<void> {
  const db = getPrisma();
  const intent = await db.paymentIntent.findUnique({ where: { id } });
  if (!intent || !['CREATED', 'PENDING', 'EXPIRED'].includes(intent.status)) return;
  if (!intent.providerRef) {
    await submitPaymentIntent(id);
    return;
  }
  let status: Awaited<ReturnType<ReturnType<typeof getPaymentProvider>['getPaymentStatus']>>;
  try {
    status = await getPaymentProvider().getPaymentStatus(intent.providerRef);
  } catch (error) {
    log.warn(
      { paymentIntentId: id, errorName: error instanceof Error ? error.name : 'Error' },
      'provider collection status check failed; retrying',
    );
    await schedulePaymentPoll(id, 60_000);
    return;
  }
  const now = clock.now();
  if (status.status === 'PENDING') {
    if (now.getTime() - intent.createdAt.getTime() >= 10 * 60_000) {
      await db.paymentIntent.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });
      await schedulePaymentPoll(
        id,
        now.getTime() - intent.createdAt.getTime() < 24 * 60 * 60_000
          ? 60 * 60_000
          : 24 * 60 * 60_000,
      );
      return;
    }
    const age = now.getTime() - intent.createdAt.getTime();
    await schedulePaymentPoll(
      id,
      age < 5_000 ? 5_000 : age < 15_000 ? 10_000 : age < 35_000 ? 20_000 : 30_000,
    );
    return;
  }
  if (status.status === 'FAILED') {
    const changed = await db.paymentIntent.updateMany({
      where: { id, status: { in: ['CREATED', 'PENDING', 'EXPIRED'] } },
      data: { status: 'FAILED' },
    });
    if (changed.count === 1) {
      const action = await db.pendingAction.findFirst({
        where: { resultRef: id, status: 'CONFIRMED' },
        select: { id: true },
      });
      if (action)
        await completePendingAction(action.id, {
          status: 'FAILED',
          failureCode: 'PAYMENT_REQUEST_FAILED',
          failureText: {
            fr: 'Paiement refusé par l’opérateur. Vérifie ton solde puis réessaie.',
            en: 'The operator declined the payment. Check your balance and try again.',
          },
        });
    }
    return;
  }
  await settleSuccessfulPayment(id, status);
}

async function settleSuccessfulPayment(
  id: string,
  providerResult: { fee?: number; operator?: 'MTN' | 'ORANGE'; operatorRef?: string },
): Promise<void> {
  const db = getPrisma();
  const now = clock.now();
  await db.$transaction(async (tx) => {
    // Two polls can arrive together: the row lock makes the second one see SUCCESSFUL and stop.
    await tx.$queryRaw`SELECT "id" FROM "PaymentIntent" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const intent = await tx.paymentIntent.findUnique({ where: { id } });
    if (!intent || intent.status === 'SUCCESSFUL') return;
    const obligations = await tx.obligation.findMany({
      where: {
        id: { in: intent.obligationIds },
        groupId: intent.groupId,
        membershipId: intent.membershipId,
      },
      include: {
        round: { select: { beneficiaryMembershipId: true, cycle: { select: { rotation: true } } } },
      },
    });
    if (obligations.length !== intent.obligationIds.length)
      throw new Error('Payment intent obligations changed');
    // Each obligation is recorded as paid once: one already settled another way stops here and
    // the payment stays unsettled for a person to refund, never booked a second time.
    if (obligations.some((o) => o.status !== 'DUE'))
      throw new Error('Payment intent covers an obligation that is no longer due');
    const currentPending = await tx.paymentIntent.findMany({
      where: {
        groupId: intent.groupId,
        membershipId: intent.membershipId,
        id: { not: id },
        OR: [{ status: { in: ['CREATED', 'PENDING'] } }, { status: 'EXPIRED' }],
        obligationIds: { hasSome: intent.obligationIds },
      },
      select: { id: true },
    });
    if (currentPending.length > 0)
      throw new Error('Obligation is covered by another pending payment');
    const feeInfo =
      providerResult.fee === undefined
        ? {
            fee: scheduleFee(feeSchedule(), 'COLLECTION', intent.amount),
            feeSource: 'SCHEDULE' as const,
          }
        : { fee: providerResult.fee, feeSource: 'PROVIDER' as const };
    const parts = obligations.map((o) => ({
      kind:
        o.kind === 'CONTRIBUTION'
          ? ('CONTRIBUTION' as const)
          : o.kind === 'SOLIDARITY'
            ? ('SOLIDARITY' as const)
            : o.kind === 'SHORTFALL_SHARE'
              ? ('SHORTFALL' as const)
              : ('DEBT' as const),
      amount: o.amount,
      roundId: o.kind === 'CONTRIBUTION' ? o.roundId : null,
      creditorMembershipId: o.kind === 'SHORTFALL_SHARE' ? o.creditorMembershipId : null,
      ref: o.id,
    }));
    const resolved = resolvePaymentParts(parts, {
      beneficiaryOfRound: (roundId) =>
        obligations.find((o) => o.roundId === roundId)?.round?.beneficiaryMembershipId ?? null,
      rotationPosition: (membershipId) => {
        const rotation =
          obligations.find((o) => o.round?.cycle.rotation.includes(membershipId))?.round?.cycle
            .rotation ?? [];
        return rotation.indexOf(membershipId) + 1;
      },
    });
    const posted = paymentReceivedPostings({
      payerMembershipId: intent.membershipId,
      fee: feeInfo.fee,
      feeSource: feeInfo.feeSource,
      parts: resolved,
    });
    const entry: LedgerEntry = {
      id: intent.id,
      type: 'PAYMENT_RECEIVED',
      occurredAt: now.toISOString(),
      roundId: obligations.find((o) => o.roundId)?.roundId ?? null,
      membershipId: intent.membershipId,
      refType: 'PaymentIntent',
      refId: intent.id,
      descriptionFr: 'Paiement reçu',
      descriptionEn: 'Payment received',
      metadata: posted.metadata,
      postings: posted.postings,
    };
    await appendLedgerEntry(tx, intent.groupId, entry);
    for (const obligation of obligations) {
      const onTime = isOnTime({
        intentCreatedAt: intent.createdAt,
        dueAt: obligation.dueAt,
        succeeded: true,
      });
      await tx.obligation.update({
        where: { id: obligation.id },
        data: { status: 'PAID', paidAt: now, onTime },
      });
    }
    for (const loanId of new Set(
      obligations.flatMap((obligation) => (obligation.loanId ? [obligation.loanId] : [])),
    )) {
      await markLoanRepaidWhenClear(tx, loanId);
    }
    const beneficiaries = new Set(
      obligations.flatMap((obligation) =>
        obligation.kind === 'CONTRIBUTION' && obligation.round?.beneficiaryMembershipId
          ? [
              {
                membershipId: obligation.round.beneficiaryMembershipId,
                roundId: obligation.roundId,
              },
            ]
          : [],
      ),
    );
    for (const beneficiary of beneficiaries) {
      await settleDueDebts(tx, {
        groupId: intent.groupId,
        membershipId: beneficiary.membershipId,
        roundId: beneficiary.roundId,
        now,
      });
    }
    await tx.paymentIntent.update({
      where: { id },
      data: {
        status: 'SUCCESSFUL',
        fee: feeInfo.fee,
        feeSource: feeInfo.feeSource,
        ...(providerResult.operator ? { operator: providerResult.operator } : {}),
        ...(providerResult.operatorRef ? { operatorRef: providerResult.operatorRef } : {}),
        settledAt: now,
      },
    });
  });
  const action = await db.pendingAction.findFirst({
    where: { resultRef: id, status: 'CONFIRMED' },
    select: { id: true },
  });
  if (action)
    await completePendingAction(action.id, {
      status: 'DONE',
      resultRef: id,
      summary: { fr: 'Paiement confirmé', en: 'Payment confirmed' },
    });
}

export async function schedulePaymentPoll(id: string, delayMs: number) {
  const { dispatchJob } = await import('../../jobs/dispatch');
  await dispatchJob(
    'payments.poll',
    { paymentIntentId: id },
    { jobId: `payment-poll-${id}-${randomUUID()}`, at: new Date(clock.nowMs() + delayMs) },
  );
}

export async function getOwnPayment(userId: string, id: string) {
  const payment = await getPrisma().paymentIntent.findFirst({
    where: { id, membership: { userId } },
  });
  if (!payment) throw paymentError('PAYMENT_NOT_FOUND');
  return {
    id: payment.id,
    amount: payment.amount,
    status: payment.status,
    createdAt: payment.createdAt.toISOString(),
    settledAt: payment.settledAt?.toISOString() ?? null,
    operatorRef: payment.operatorRef,
  };
}

export async function pendingActionResult(intentId: string) {
  return getPrisma().paymentIntent.findUnique({
    where: { id: intentId },
    select: { status: true },
  });
}

/** What the member owes in the group today, oldest first: the choices of a payment (spec 2.6). */
export async function listMyDues(userId: string, groupId: string, db: Db = getPrisma()) {
  const access = await authorizeGroup(userId, groupId, 'group.payments.create', db);
  const rows = await db.obligation.findMany({
    where: { groupId, membershipId: access.membership.id, status: 'DUE' },
    orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      kind: true,
      amount: true,
      dueAt: true,
      loanId: true,
      round: { select: { number: true } },
    },
    take: 200,
  });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    amount: row.amount,
    dueAt: row.dueAt,
    loanId: row.loanId,
    roundNumber: row.round?.number ?? null,
  }));
}

/** Prepares the payment card for these obligations (the member confirms it in the app). */
export async function requestPayment(
  actor: AuthActor,
  groupId: string,
  obligationIds: string[],
  origin: ActionOrigin = 'UI',
) {
  await authorizeGroup(actor.userId, groupId, 'group.payments.create');
  return createPendingAction({
    userId: actor.userId,
    groupId,
    lang: actor.lang,
    origin,
    type: 'PAY',
    args: { groupId, obligationIds },
  });
}
