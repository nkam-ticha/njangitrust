// R5.3 auto-settlement: a payable is always reduced by whole due debts before it is available.
import {
  autoSettlement,
  accountBalance,
  autoSettlementPostings,
  payableAccount,
} from '@njangi/rules';
import type { Prisma } from '../../lib/prisma';
import { appendLedgerEntry } from '../ledger';

type Tx = Prisma.TransactionClient;

export async function settleDueDebts(
  tx: Tx,
  input: { groupId: string; membershipId: string; now: Date; roundId?: string | null },
): Promise<{ settledAmount: number; settledIds: string[]; uncoveredAmount: number }> {
  const account = payableAccount(input.membershipId);
  const [postings, rows] = await Promise.all([
    tx.ledgerPosting.findMany({
      where: { transaction: { groupId: input.groupId }, account },
      select: { amount: true },
    }),
    tx.obligation.findMany({
      where: {
        groupId: input.groupId,
        membershipId: input.membershipId,
        status: 'DUE',
        kind: { in: ['BID', 'FINE', 'CORRECTION', 'LOAN_INSTALLMENT'] },
        dueAt: { lte: input.now },
      },
      include: { loan: { select: { status: true, disbursement: { select: { status: true } } } } },
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
    }),
  ]);
  // A debt the member is paying right now (a payment asked and not yet answered) is left alone:
  // taking it from the payable too would make them pay it twice.
  const paying = await tx.paymentIntent.findMany({
    where: {
      groupId: input.groupId,
      membershipId: input.membershipId,
      status: { in: ['CREATED', 'PENDING', 'EXPIRED'] },
    },
    select: { obligationIds: true },
  });
  const reserved = new Set(paying.flatMap((intent) => intent.obligationIds));
  const payableBalance = accountBalance(
    account,
    postings.map((item) => ({ account, amount: item.amount })),
  );
  const debts = rows
    .filter((row) => !reserved.has(row.id))
    .map((row) => ({
      id: row.id,
      kind: row.kind as 'BID' | 'FINE' | 'CORRECTION' | 'LOAN_INSTALLMENT',
      amount: row.amount,
      dueAt: row.dueAt,
      loanInFlight:
        row.kind === 'LOAN_INSTALLMENT' &&
        (row.loan?.status === 'APPROVED' ||
          ['CREATED', 'PENDING', 'EXPIRED'].includes(row.loan?.disbursement?.status ?? '')),
    }));
  const result = autoSettlement({ payableBalance, debts, now: input.now });
  if (result.settled.length === 0) {
    return { settledAmount: 0, settledIds: [], uncoveredAmount: result.uncoveredTotal };
  }
  const ids = result.settled.map((item) => item.id);
  const metadataDebts = result.settled.map((item) => ({
    id: item.id,
    kind: item.kind,
    amount: item.amount,
  }));
  await appendLedgerEntry(tx, input.groupId, {
    type: 'AUTO_SETTLEMENT',
    occurredAt: input.now.toISOString(),
    roundId: input.roundId ?? null,
    membershipId: input.membershipId,
    refType: null,
    refId: null,
    descriptionFr: 'Règlement automatique des dettes échues',
    descriptionEn: 'Automatic settlement of due debts',
    metadata: { debts: metadataDebts, total: result.total },
    postings: autoSettlementPostings({ membershipId: input.membershipId, amount: result.total }),
  });
  await tx.obligation.updateMany({
    where: { id: { in: ids }, status: 'DUE' },
    data: { status: 'SETTLED', paidAt: input.now },
  });
  for (const loanId of new Set(
    rows.filter((row) => ids.includes(row.id) && row.loanId).map((row) => row.loanId!),
  )) {
    const { markLoanRepaidWhenClear } = await import('../loans/loans.service');
    await markLoanRepaidWhenClear(tx, loanId);
  }
  return { settledAmount: result.total, settledIds: ids, uncoveredAmount: result.uncoveredTotal };
}
