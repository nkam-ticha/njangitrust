// Provider-account daily caisse check (spec 2.9, R5.5, CAI-05, D16.2).
import { dailyReconciliation, type FeeSchedule, type LedgerTransaction } from '@njangi/rules';
import { AfterCommit } from '../../lib/after-commit';
import { clock } from '../../lib/clock';
import { getEnv } from '../../config/env';
import { componentLogger } from '../../lib/logger';
import { getPrisma, type Prisma } from '../../lib/prisma';
import { createNotifications } from '../notifications';
import { getPaymentProvider } from '../providers';

const log = componentLogger('reconciliation');
const LATE_COLLECTION_WINDOW_MS = 24 * 60 * 60_000;

function configuredFeeSchedule(): FeeSchedule {
  const configured = getEnv().FEE_SCHEDULE;
  return {
    collection: [{ upTo: null, fixed: configured.collection, ratePermille: 0 }],
    disbursement: [{ upTo: null, fixed: configured.disbursement, ratePermille: 0 }],
  };
}

function mapTransactions(
  rows: Awaited<ReturnType<typeof loadGroups>>[number]['ledgerTransactions'],
): LedgerTransaction[] {
  return rows.map((row) => ({
    id: row.id,
    groupId: row.groupId,
    seq: row.seq,
    type: row.type,
    occurredAt: row.occurredAt.toISOString(),
    roundId: row.roundId,
    membershipId: row.membershipId,
    refType: row.refType,
    refId: row.refId,
    descriptionFr: row.descriptionFr,
    descriptionEn: row.descriptionEn,
    metadata: row.metadata as LedgerTransaction['metadata'],
    postings: row.postings.map((posting) => ({ account: posting.account, amount: posting.amount })),
    prevHash: row.prevHash,
    hash: row.hash,
  }));
}

async function loadGroups(providerAccount: string) {
  return getPrisma().group.findMany({
    where: { providerAccount },
    select: {
      id: true,
      memberships: {
        where: { status: { in: ['ACTIVE', 'LEAVING', 'INVITED'] } },
        select: { userId: true },
      },
      ledgerTransactions: {
        orderBy: { seq: 'asc' },
        include: { postings: true },
      },
    },
  });
}

/** Runs one account-wide reconciliation and returns the persisted run. */
export async function runDailyReconciliation(providerAccount = 'default') {
  const db = getPrisma();
  const now = clock.now();
  const groups = await loadGroups(providerAccount);
  const pending = await db.paymentIntent.findMany({
    where: {
      group: { providerAccount },
      OR: [
        { status: { in: ['CREATED', 'PENDING'] } },
        {
          status: 'EXPIRED',
          createdAt: { gt: new Date(now.getTime() - LATE_COLLECTION_WINDOW_MS) },
        },
      ],
    },
    select: { amount: true },
  });
  const transactions = groups.map((group) => ({
    groupId: group.id,
    transactions: mapTransactions(group.ledgerTransactions),
  }));

  let providerBalance: number | null = null;
  let providerFailure: string | null = null;
  try {
    const balance = await getPaymentProvider().getBalance(providerAccount);
    if (!Number.isSafeInteger(balance.total) || balance.total < 0)
      providerFailure = 'INVALID_PROVIDER_BALANCE';
    else providerBalance = balance.total;
  } catch (error) {
    providerFailure = error instanceof Error ? error.name : 'PROVIDER_UNAVAILABLE';
    log.error(
      { providerAccount, errorName: providerFailure },
      'provider balance unavailable during reconciliation',
    );
  }

  // A failed balance query is an explicit ALERT. Zero is only a storage placeholder; details make
  // that clear and the pause state never treats the placeholder as a measured provider balance.
  const computed = dailyReconciliation({
    groups: transactions,
    providerBalance: providerBalance ?? 0,
    pendingCollections: pending.map((intent) => intent.amount),
    feeSchedule: configuredFeeSchedule(),
  });
  const status = providerFailure ? 'ALERT' : computed.status;
  const differences = computed.difference;
  const details = {
    withdrawalsPaused: status === 'ALERT',
    ...(providerFailure ? { providerBalanceUnavailable: providerFailure } : {}),
    ledgerProblemCount: computed.groups.reduce((count, group) => count + group.problems.length, 0),
    reservedShortfall: computed.reservedShortfall,
    inFlightDisbursements: computed.inFlightDisbursements,
    inFlightCollections: computed.inFlightCollections,
    inFlightFeeTolerance: computed.inFlightFeeTolerance,
    groups: computed.groups.map((group) => ({
      groupId: group.groupId,
      problems: group.problems.map(({ seq, code, detail }) => ({ seq, code, detail })),
      reservedShortfall: group.reservedShortfall,
      coverageGaps: group.coverageGaps,
    })),
  };

  const effects = new AfterCommit();
  const previousRun = await db.reconciliationRun.findFirst({
    where: { providerAccount },
    orderBy: { ranAt: 'desc' },
    select: { status: true },
  });
  const run = await db.$transaction(async (tx) => {
    const saved = await tx.reconciliationRun.create({
      data: {
        ranAt: now,
        providerAccount,
        providerBalance: providerBalance ?? 0,
        ledgerCash: computed.ledgerCash,
        inFlight: computed.inFlightDisbursements + computed.inFlightCollections,
        difference: differences,
        status,
        // Plain numbers, strings and arrays only: stored as the JSON it already is.
        details: JSON.parse(JSON.stringify(details)) as Prisma.InputJsonObject,
      },
    });
    if (status === 'ALERT' && previousRun?.status !== 'ALERT') {
      const alertBody = providerFailure
        ? {
            fr: 'La vérification de la caisse ne peut pas lire la balance de l’opérateur. Les retraits et versements sont suspendus jusqu’au rétablissement du service.',
            en: 'The caisse check cannot read the provider balance. Withdrawals and disbursements are paused until the service recovers.',
          }
        : computed.reservedShortfall > 0
          ? {
              fr: 'La caisse ne couvre pas tout l’argent réservé aux membres. Les retraits et versements sont suspendus jusqu’à ce que la couverture soit rétablie.',
              en: 'The caisse does not cover all money reserved for members. Withdrawals and disbursements are paused until coverage is restored.',
            }
          : computed.groups.some((group) => group.problems.length > 0)
            ? {
                fr: 'La vérification a trouvé une anomalie dans le registre. Les retraits et versements sont suspendus jusqu’à sa résolution.',
                en: 'The check found an inconsistency in the records. Withdrawals and disbursements are paused until it is resolved.',
              }
            : {
                fr: 'La balance de l’opérateur ne correspond pas au registre, même en tenant compte des opérations en cours. Les retraits et versements sont suspendus jusqu’à la résolution de l’écart.',
                en: 'The provider balance does not match the records, even after accounting for operations in progress. Withdrawals and disbursements are paused until the difference is resolved.',
              };
      const memberNotices = groups.flatMap((group) =>
        group.memberships.map((membership) => ({
          userId: membership.userId,
          groupId: group.id,
          category: 'SECURITY' as const,
          title: { fr: 'Vérification de la caisse', en: 'Caisse check' },
          body: alertBody,
          deepLink: '/caisse',
        })),
      );
      await createNotifications(memberNotices, effects, tx);
    }
    return saved;
  });
  await effects.run();
  return run;
}

/** Runs the account check for each configured provider account. */
export async function runAllDailyReconciliations() {
  const accounts = await getPrisma().group.findMany({
    distinct: ['providerAccount'],
    select: { providerAccount: true },
  });
  if (accounts.length === 0) return [await runDailyReconciliation('default')];
  const runs = [];
  for (const { providerAccount } of accounts)
    runs.push(await runDailyReconciliation(providerAccount));
  return runs;
}

/** Last daily check for the provider account that holds this group's money. */
export async function latestGroupReconciliation(userId: string, groupId: string) {
  const db = getPrisma();
  const membership = await db.membership.findFirst({
    where: { groupId, userId, status: { in: ['ACTIVE', 'LEAVING', 'INVITED', 'LEFT', 'REMOVED'] } },
    select: { id: true },
  });
  if (!membership) return null;
  const group = await db.group.findUnique({
    where: { id: groupId },
    select: { providerAccount: true },
  });
  if (!group) return null;
  const run = await db.reconciliationRun.findFirst({
    where: { providerAccount: group.providerAccount },
    orderBy: { ranAt: 'desc' },
  });
  if (!run) return null;
  const details = run.details as {
    withdrawalsPaused?: boolean;
    providerBalanceUnavailable?: string;
    reservedShortfall?: number;
    ledgerProblemCount?: number;
  };
  const reason = details.providerBalanceUnavailable
    ? 'PROVIDER_UNAVAILABLE'
    : (details.reservedShortfall ?? 0) > 0
      ? 'RESERVED_NOT_COVERED'
      : (details.ledgerProblemCount ?? 0) > 0
        ? 'LEDGER_INTEGRITY'
        : run.status === 'ALERT'
          ? 'PROVIDER_BALANCE_MISMATCH'
          : null;
  return {
    ranAt: run.ranAt.toISOString(),
    status: run.status,
    withdrawalsPaused: details.withdrawalsPaused ?? run.status === 'ALERT',
    reason,
  };
}
