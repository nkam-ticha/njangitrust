// Voted corrections of the ledger (R11.1 LEDGER_CORRECTION, R6.4 FINE_WAIVER, D15 to D18). Nothing
// is ever changed or erased: an entry is cancelled by a REVERSAL, after the corrections that keep
// every payable, pot and fund at or above zero. All amounts come from @njangi/rules.
import {
  checkLedger,
  correctionDebts,
  planClawbackReleases,
  planReversalCorrections,
  reversalPostings,
  type LedgerTransaction,
} from '@njangi/rules';
import { clock } from '../../lib/clock';
import { componentLogger } from '../../lib/logger';
import type { Db, Prisma } from '../../lib/prisma';
import { readChain } from '../statements/ledger-read';
import { appendLedgerEntry } from './ledger.service';

type Tx = Prisma.TransactionClient;

const log = componentLogger('ledger');

/** The entries a vote can cancel: the others are undone by their own flow (returns, refunds). */
const CORRECTABLE = ['PAYMENT_RECEIVED', 'FINE_ASSESSED'];

const reversedSeqs = (chain: readonly LedgerTransaction[]) =>
  new Set(
    chain
      .filter((entry) => entry.type === 'REVERSAL')
      .map((entry) => entry.metadata.reversesSeq)
      .filter((seq): seq is number => typeof seq === 'number'),
  );

async function lockGroup(tx: Tx, groupId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Group" WHERE "id" = ${groupId}::uuid FOR UPDATE`;
}

/** Whether the entry exists and a vote can cancel it. */
export async function describeLedgerEntry(
  db: Db,
  input: { groupId: string; seq: number },
): Promise<{ correctable: boolean } | null> {
  const chain = await readChain(db, input.groupId);
  const entry = chain.find((item) => item.seq === input.seq);
  if (!entry) return null;
  if (!CORRECTABLE.includes(entry.type) || reversedSeqs(chain).has(entry.seq)) {
    return { correctable: false };
  }
  if (entry.type === 'FINE_ASSESSED') {
    // A fine already paid has left the receivable: cancelling its entry would not give it back.
    // One being paid right now would be collected and never booked.
    const fine = entry.refId
      ? await describeFine(db, { groupId: input.groupId, obligationId: entry.refId })
      : null;
    return { correctable: fine?.waivable === true };
  }
  return { correctable: true };
}

/**
 * Cancels `original` in the group's ledger: the corrections the rules ask for, each debt they
 * leave as a CORRECTION obligation due now, then the exact REVERSAL. The ledger is checked whole
 * before the transaction may commit.
 */
async function reverseEntry(
  tx: Tx,
  input: { groupId: string; original: LedgerTransaction; proposalId: string; now: Date },
  text: { fr: string; en: string },
): Promise<void> {
  const { original, now } = input;
  const chain = await readChain(tx, input.groupId);
  const plan = planReversalCorrections({ original, ledger: chain });
  const debts = correctionDebts(plan);
  for (const [index, correction] of plan.entries()) {
    const entry = await appendLedgerEntry(tx, input.groupId, {
      type: correction.type,
      occurredAt: now.toISOString(),
      roundId: null,
      membershipId: correction.membershipId,
      refType: 'LedgerTransaction',
      refId: original.id,
      descriptionFr: `Régularisation avant l’annulation de l’écriture n° ${original.seq}`,
      descriptionEn: `Adjustment before entry no. ${original.seq} is cancelled`,
      metadata: correction.metadata,
      postings: correction.postings,
    });
    const debt = debts.find((item) => item.index === index);
    if (debt) {
      await tx.obligation.create({
        data: {
          groupId: input.groupId,
          membershipId: debt.membershipId,
          kind: 'CORRECTION',
          amount: debt.amount,
          dueAt: now,
          // A release of this clawback later cancels exactly this debt.
          clawbackSeq: correction.type === 'CLAWBACK' ? entry.seq : null,
        },
      });
    }
  }
  await appendLedgerEntry(tx, input.groupId, {
    type: 'REVERSAL',
    occurredAt: now.toISOString(),
    roundId: original.roundId,
    membershipId: original.membershipId,
    refType: 'LedgerTransaction',
    refId: original.id,
    descriptionFr: text.fr,
    descriptionEn: text.en,
    metadata: { reversesSeq: original.seq, proposalId: input.proposalId },
    postings: reversalPostings(original.postings),
  });
  await assertSoundLedger(tx, input.groupId);
}

/** The whole ledger is checked before a transaction that wrote to it may commit. */
async function assertSoundLedger(tx: Tx, groupId: string): Promise<void> {
  const problems = checkLedger(groupId, await readChain(tx, groupId));
  if (problems.length > 0) {
    log.error(
      { groupId, codes: problems.map((p) => p.code) },
      'refused: it would leave the ledger unsound',
    );
    throw new Error('The change would leave the ledger unsound');
  }
}

/** LEDGER_CORRECTION: the group voted to cancel entry `seq`. */
export async function correctLedger(
  tx: Tx,
  input: { groupId: string; seq: number; correction: string; proposalId: string; now?: Date },
): Promise<void> {
  await lockGroup(tx, input.groupId);
  const now = input.now ?? clock.now();
  const chain = await readChain(tx, input.groupId);
  const original = chain.find((item) => item.seq === input.seq);
  const described = await describeLedgerEntry(tx, input);
  if (!original || !described?.correctable) {
    // Paid, waived or already cancelled since the vote opened: there is nothing left to cancel.
    log.warn({ groupId: input.groupId, seq: input.seq }, 'ledger correction has nothing to cancel');
    return;
  }
  await reverseEntry(
    tx,
    { groupId: input.groupId, original, proposalId: input.proposalId, now },
    {
      fr: `Écriture n° ${original.seq} annulée par un vote`,
      en: `Entry no. ${original.seq} cancelled by a vote`,
    },
  );
  if (original.type === 'FINE_ASSESSED' && original.refId) {
    await tx.obligation.updateMany({
      where: { id: original.refId, status: 'DUE' },
      data: { status: 'CANCELLED' },
    });
    return;
  }
  // A cancelled payment no longer counts: what it paid is due again.
  const intent = original.refId
    ? await tx.paymentIntent.findUnique({
        where: { id: original.refId },
        select: { obligationIds: true },
      })
    : null;
  if (!intent) return;
  const paid = await tx.obligation.findMany({
    where: { id: { in: intent.obligationIds }, status: 'PAID' },
    select: { id: true, loanId: true },
  });
  await tx.obligation.updateMany({
    where: { id: { in: paid.map((item) => item.id) } },
    data: { status: 'DUE', paidAt: null, onTime: null },
  });
  const loanIds = [...new Set(paid.map((item) => item.loanId).filter((id) => id !== null))];
  if (loanIds.length > 0) {
    await tx.loan.updateMany({
      where: { id: { in: loanIds }, status: 'REPAID' },
      data: { status: 'DISBURSED' },
    });
  }
}

/** FINE_WAIVER: the fine (a FINE obligation of this group), or null if there is none. */
export async function describeFine(
  db: Db,
  input: { groupId: string; obligationId: string },
): Promise<{
  membershipId: string;
  amount: number;
  roundNumber: number | null;
  waivable: boolean;
} | null> {
  const fine = await db.obligation.findFirst({
    where: { id: input.obligationId, groupId: input.groupId, kind: 'FINE' },
    select: {
      membershipId: true,
      amount: true,
      status: true,
      round: { select: { number: true } },
    },
  });
  if (!fine) return null;
  const paying = await db.paymentIntent.count({
    where: {
      groupId: input.groupId,
      status: { in: ['CREATED', 'PENDING', 'EXPIRED'] },
      obligationIds: { has: input.obligationId },
    },
  });
  return {
    membershipId: fine.membershipId,
    amount: fine.amount,
    roundNumber: fine.round?.number ?? null,
    // Only a fine still owed: one being paid or already paid is not waived.
    waivable: fine.status === 'DUE' && paying === 0,
  };
}

/** R6.4: the group waived the fine: its FINE_ASSESSED entry is reversed and the debt cancelled. */
export async function waiveFine(
  tx: Tx,
  input: { groupId: string; obligationId: string; proposalId: string; now?: Date },
): Promise<void> {
  await lockGroup(tx, input.groupId);
  const fine = await describeFine(tx, input);
  if (!fine?.waivable) {
    log.warn({ groupId: input.groupId }, 'fine waiver has nothing to cancel');
    return;
  }
  const chain = await readChain(tx, input.groupId);
  const original = chain.find(
    (entry) => entry.type === 'FINE_ASSESSED' && entry.refId === input.obligationId,
  );
  if (!original || reversedSeqs(chain).has(original.seq)) return;
  const now = input.now ?? clock.now();
  await reverseEntry(
    tx,
    { groupId: input.groupId, original, proposalId: input.proposalId, now },
    { fr: 'Amende annulée par un vote', en: 'Fine waived by a vote' },
  );
  await tx.obligation.updateMany({
    where: { id: input.obligationId, status: 'DUE' },
    data: { status: 'CANCELLED' },
  });
}

/**
 * Q1, Q3: right after a solidarity payout's money came back to the fund (`returned`, already in
 * the ledger), releases the clawbacks it made unnecessary. An unpaid clawback debt is cancelled
 * (and replaced by what is left of it); what was already paid goes back to the member's payable.
 * Returns the members credited, for auto-settlement.
 */
export async function sealClawbackReleases(
  tx: Tx,
  input: { groupId: string; returnedSeq: number; now: Date },
): Promise<string[]> {
  const chain = await readChain(tx, input.groupId);
  const returned = chain.find((entry) => entry.seq === input.returnedSeq);
  if (!returned) return [];
  // The CORRECTION debts the clawbacks left, by the seq of their clawback; a debt in an open
  // payment counts as paid (the payment settles it).
  const debts = await tx.obligation.findMany({
    where: {
      groupId: input.groupId,
      kind: 'CORRECTION',
      status: 'DUE',
      clawbackSeq: { not: null },
    },
    select: { id: true, dueAt: true, clawbackSeq: true },
  });
  const paying = await tx.paymentIntent.findMany({
    where: {
      groupId: input.groupId,
      status: { in: ['CREATED', 'PENDING', 'EXPIRED'] },
      obligationIds: { hasSome: debts.map((debt) => debt.id) },
    },
    select: { obligationIds: true },
  });
  const inPayment = new Set(paying.flatMap((intent) => intent.obligationIds));
  const unpaid = new Map<number, { id: string; dueAt: Date }>();
  for (const debt of debts) {
    if (!inPayment.has(debt.id)) unpaid.set(debt.clawbackSeq!, { id: debt.id, dueAt: debt.dueAt });
  }
  const plan = planClawbackReleases({
    ledger: chain,
    returned,
    debtUnpaid: (seq) => unpaid.has(seq),
  });
  const credited = new Set<string>();
  for (const release of plan) {
    await appendLedgerEntry(tx, input.groupId, {
      type: release.type,
      occurredAt: input.now.toISOString(),
      roundId: null,
      membershipId: release.membershipId,
      refType: 'LedgerTransaction',
      refId: returned.id,
      descriptionFr: 'Dette de secours libérée',
      descriptionEn: 'Solidarity debt released',
      metadata: release.metadata,
      postings: release.postings,
    });
    const debt = unpaid.get(release.metadata.clawbackSeq);
    if (release.fromDebt > 0 && debt) {
      await tx.obligation.update({ where: { id: debt.id }, data: { status: 'CANCELLED' } });
      if (release.debtLeft > 0) {
        await tx.obligation.create({
          data: {
            groupId: input.groupId,
            membershipId: release.membershipId,
            kind: 'CORRECTION',
            amount: release.debtLeft,
            dueAt: debt.dueAt,
            clawbackSeq: release.metadata.clawbackSeq,
          },
        });
      }
    }
    if (release.toPayable > 0) credited.add(release.membershipId);
  }
  if (plan.length > 0) await assertSoundLedger(tx, input.groupId);
  return [...credited];
}
