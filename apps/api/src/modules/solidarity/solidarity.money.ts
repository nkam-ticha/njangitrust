// The solidarity fund's money (R10, D13.5, D18.1): its balance, and paying a request the group
// voted. Every amount comes from @njangi/rules; this module loads state, records the send in the
// ledger and hands the operation to the disbursement jobs.
import { randomUUID } from 'node:crypto';
import {
  activeHold,
  computeBalances,
  scheduleFee,
  solidaritySentPostings,
  sumFcfa,
  summarizeBalances,
  validateSolidarityDisbursement,
} from '@njangi/rules';
import type { Job } from 'bullmq';
import { getEnv } from '../../config/env';
import type { EffectSink } from '../../lib/after-commit';
import { clock } from '../../lib/clock';
import { componentLogger } from '../../lib/logger';
import { getPrisma, type Db, type Prisma } from '../../lib/prisma';
import { dispatchJob } from '../../jobs/dispatch';
import { registerJob, registerRepeatable } from '../../jobs/registry';
import { appendLedgerEntry } from '../ledger';
import { configuredFeeSchedule } from '../loans/loans.service';
import { getCurrentParams } from '../rulesets';
import { readChain } from '../statements/ledger-read';

type Tx = Prisma.TransactionClient;

const log = componentLogger('solidarity');

/** A send that is on its way or done: the request must not be sent again. */
const LIVE_SEND = ['CREATED', 'PENDING', 'EXPIRED', 'SUCCESSFUL'];

/** R10: what the fund holds, and what passed requests not yet sent will take from it. */
export async function solidarityFund(
  db: Db,
  groupId: string,
): Promise<{ balance: number; pendingPayouts: number }> {
  const [chain, waiting] = await Promise.all([
    readChain(db, groupId),
    db.solidarityRequest.findMany({
      where: { groupId, status: 'APPROVED', disbursementId: null },
      select: { amount: true },
    }),
  ]);
  return {
    balance: summarizeBalances(computeBalances(chain)).solidarityFund,
    pendingPayouts: sumFcfa(waiting.map((request) => request.amount)),
  };
}

/**
 * R10.3, D13.5: sends a passed request when nothing blocks it (the recipient's number-change hold,
 * a daily-check ALERT, a fund that no longer holds the amount). The send is recorded in the ledger
 * in this transaction; the operator is asked after the commit. Returns the disbursement to submit,
 * or null when the request waits (the hourly scan tries again).
 */
async function sendSolidarity(tx: Tx, requestId: string, now: Date): Promise<string | null> {
  await tx.$queryRaw`SELECT "id" FROM "SolidarityRequest" WHERE "id" = ${requestId}::uuid FOR UPDATE`;
  const request = await tx.solidarityRequest.findUnique({
    where: { id: requestId },
    include: {
      disbursement: { select: { status: true } },
      recipient: {
        include: {
          user: { include: { paymentNumbers: { where: { activeTo: null }, take: 1 } } },
        },
      },
    },
  });
  if (!request || request.status !== 'APPROVED') return null;
  if (request.disbursement && LIVE_SEND.includes(request.disbursement.status)) return null;

  // The group lock: the fund balance read here is the one the ledger entry is sealed against.
  await tx.$queryRaw`SELECT "id" FROM "Group" WHERE "id" = ${request.groupId}::uuid FOR UPDATE`;
  const group = await tx.group.findUniqueOrThrow({
    where: { id: request.groupId },
    select: { providerAccount: true },
  });
  const user = request.recipient.user;
  const number = user.paymentNumbers[0];
  const hadAnotherNumber = number
    ? (await tx.paymentNumber.count({
        where: { userId: user.id, activeTo: { not: null }, activeFrom: { lte: number.activeFrom } },
      })) > 0
    : false;
  const params = await getCurrentParams(request.groupId, tx);
  const check = await tx.reconciliationRun.findFirst({
    where: { providerAccount: group.providerAccount },
    orderBy: { ranAt: 'desc' },
    select: { status: true },
  });
  const feeEstimated = scheduleFee(configuredFeeSchedule(), 'DISBURSEMENT', request.amount);
  const fund = summarizeBalances(computeBalances(await readChain(tx, request.groupId)));
  const allowed = validateSolidarityDisbursement({
    amount: request.amount,
    solidarityFundBalance: fund.solidarityFund,
    feeEstimate: feeEstimated,
    hold: activeHold({
      numberChangedAt: hadAnotherNumber ? (number?.activeFrom ?? null) : null,
      pinResetAt: user.pinResetAt,
      holdHours: params.numberChangeHoldHours,
      now,
    }),
    reconciliationStatus: check?.status ?? null,
    hasActivePaymentNumber: Boolean(number),
  });
  // A recipient who left the group after the vote is not sent anything.
  if (!allowed.ok || !['ACTIVE', 'LEAVING'].includes(request.recipient.status)) {
    log.info(
      { requestId, reason: allowed.ok ? 'RECIPIENT_NOT_MEMBER' : allowed.code },
      'solidarity payout waits',
    );
    return null;
  }

  const id = randomUUID();
  const sent = solidaritySentPostings({ operationId: id, amount: request.amount, feeEstimated });
  await tx.disbursement.create({
    data: {
      id,
      groupId: request.groupId,
      membershipId: request.recipientMembershipId,
      purpose: 'SOLIDARITY',
      // What reaches the recipient: the voted amount less the operator's fee (R4.3).
      amount: sent.metadata.amount,
      feeEstimated,
      phoneSnapshot: number!.number,
      provider: getEnv().PAYMENT_PROVIDER,
      status: 'CREATED',
    },
  });
  await tx.solidarityRequest.update({ where: { id: requestId }, data: { disbursementId: id } });
  await appendLedgerEntry(tx, request.groupId, {
    type: 'DISBURSEMENT_SENT',
    occurredAt: now.toISOString(),
    roundId: null,
    membershipId: request.recipientMembershipId,
    refType: 'Disbursement',
    refId: id,
    descriptionFr: 'Soutien de la caisse de secours envoyé',
    descriptionEn: 'Solidarity support sent',
    metadata: sent.metadata,
    postings: sent.postings,
  });
  return id;
}

const submit = (disbursementId: string) =>
  dispatchJob(
    'disbursements.submit',
    { disbursementId },
    { jobId: `disbursement-submit-${disbursementId}` },
  );

/** The vote passed: pay now when possible, inside the vote's own transaction. */
export async function paySolidarity(
  tx: Tx,
  input: { groupId: string; solidarityRequestId: string; proposalId: string },
  effects?: EffectSink,
): Promise<void> {
  const disbursementId = await sendSolidarity(tx, input.solidarityRequestId, clock.now());
  if (disbursementId && effects) effects.add(() => submit(disbursementId));
}

/** Requests that passed and still wait (a hold that ended, a send that failed to start). */
export async function payWaitingSolidarity(now: Date = clock.now()): Promise<number> {
  const waiting = await getPrisma().solidarityRequest.findMany({
    where: { status: 'APPROVED' },
    select: { id: true, disbursement: { select: { id: true, status: true, providerRef: true } } },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
  let sent = 0;
  for (const request of waiting) {
    // Recorded but never handed to the operator (the server stopped after the commit).
    if (request.disbursement?.status === 'CREATED' && !request.disbursement.providerRef) {
      await submit(request.disbursement.id);
      continue;
    }
    const id = await getPrisma().$transaction((tx) => sendSolidarity(tx, request.id, now));
    if (!id) continue;
    await submit(id);
    sent += 1;
  }
  return sent;
}

export function registerSolidarityJobs(): void {
  registerJob({
    name: 'solidarity.pay.scan',
    keepNoHistory: true,
    process: async (_job: Job) => {
      await payWaitingSolidarity();
    },
  });
  registerRepeatable({
    id: 'solidarity.pay.scan.hourly',
    name: 'solidarity.pay.scan',
    pattern: '15 * * * *',
  });
}
