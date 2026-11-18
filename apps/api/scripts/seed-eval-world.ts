import { randomUUID } from 'node:crypto';
import {
  fineAssessedPostings,
  paymentReceivedPostings,
  sealTransaction,
  type LedgerEntry,
} from '@njangi/rules';
import { createPrisma } from '../src/lib/prisma';

const url = process.env.EVAL_DATABASE_URL;
if (!url) throw new Error('EVAL_DATABASE_URL is required');
const target = new URL(url);
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
  throw new Error('EVAL_DATABASE_URL must point to a local database');
}
if (target.pathname.replace(/^\//, '') !== 'njangitrust_eval') {
  throw new Error('EVAL_DATABASE_URL must target njangitrust_eval');
}
const prisma = createPrisma(url);

async function main() {
  console.log('Seeding eval world in njangitrust_eval...');

  const collegues = await prisma.group.findFirstOrThrow({
    where: { name: 'Njangi des Collègues' },
    include: {
      memberships: { include: { user: true } },
      rounds: { orderBy: { number: 'asc' } },
      cycles: { where: { number: 1 } },
    },
  });
  const cycle = collegues.cycles[0];
  if (!cycle) throw new Error('The evaluation group has no first cycle');

  const rounds = collegues.rounds;
  const round1 = rounds.find((r) => r.number === 1)!;
  const round2 = rounds.find((r) => r.number === 2)!;
  const round3 = rounds.find((r) => r.number === 3)!;
  const round4 = rounds.find((r) => r.number === 4)!;

  const carine = collegues.memberships.find((m) => m.user.name.includes('Carine'))!;
  const paul = collegues.memberships.find((m) => m.user.name.includes('Paul'))!;
  const joel = collegues.memberships.find((m) => m.user.name.includes('Joël'))!;
  const nkam = collegues.memberships.find((m) => m.user.name.includes('Nkam'))!;

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 48 * 3600 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
  const dayAfterTomorrow = new Date(now.getTime() + 48 * 3600 * 1000);

  // 1. Update round dates and statuses
  await prisma.round.update({
    where: { id: round1.id },
    data: {
      status: 'CLOSED',
      dueAt: new Date(now.getTime() - 90 * 86400000),
      payoutAt: new Date(now.getTime() - 89 * 86400000),
    },
  });
  await prisma.round.update({
    where: { id: round2.id },
    data: { status: 'CLOSED', dueAt: twoDaysAgo, payoutAt: yesterday },
  });
  await prisma.round.update({
    where: { id: round3.id },
    data: { status: 'CLOSED', dueAt: yesterday, payoutAt: now },
  });
  await prisma.round.update({
    where: { id: round4.id },
    data: { status: 'OPEN', dueAt: tomorrow, payoutAt: dayAfterTomorrow },
  });

  // 2. Paul: paid rounds 1, 2, 3; owes round 4
  await prisma.obligation.updateMany({
    where: { membershipId: paul.id, roundId: round1.id },
    data: { status: 'PAID', paidAt: yesterday },
  });

  for (const r of [round2, round3]) {
    const existing = await prisma.obligation.findFirst({
      where: { membershipId: paul.id, roundId: r.id, kind: 'CONTRIBUTION' },
    });
    if (existing) {
      await prisma.obligation.update({
        where: { id: existing.id },
        data: { status: 'PAID', paidAt: yesterday },
      });
    } else {
      await prisma.obligation.create({
        data: {
          groupId: collegues.id,
          membershipId: paul.id,
          roundId: r.id,
          kind: 'CONTRIBUTION',
          amount: 10000,
          status: 'PAID',
          dueAt: r.dueAt,
          paidAt: yesterday,
          onTime: true,
        },
      });
    }
  }

  // Create Paul's Round 4 obligation as DUE
  const paulR4 = await prisma.obligation.findFirst({
    where: { membershipId: paul.id, roundId: round4.id, kind: 'CONTRIBUTION' },
  });
  if (paulR4) {
    await prisma.obligation.update({
      where: { id: paulR4.id },
      data: { status: 'DUE', dueAt: round4.dueAt, paidAt: null, onTime: null },
    });
  } else {
    await prisma.obligation.create({
      data: {
        groupId: collegues.id,
        membershipId: paul.id,
        roundId: round4.id,
        kind: 'CONTRIBUTION',
        amount: 10000,
        status: 'DUE',
        dueAt: round4.dueAt,
      },
    });
  }

  // Ensure Paul has no overdue debts in any group
  await prisma.obligation.updateMany({
    where: {
      membership: { userId: paul.userId },
      status: 'DUE',
      kind: { in: ['FINE', 'BID', 'CORRECTION', 'LOAN_INSTALLMENT'] },
    },
    data: { status: 'PAID', paidAt: yesterday },
  });

  // 3. Joël: owes Round 2 and Round 3 (overdue), and owes Round 4
  for (const r of [round2, round3]) {
    const existing = await prisma.obligation.findFirst({
      where: { membershipId: joel.id, roundId: r.id, kind: 'CONTRIBUTION' },
    });
    if (existing) {
      await prisma.obligation.update({
        where: { id: existing.id },
        data: { status: 'DUE', dueAt: r.dueAt, paidAt: null, onTime: null },
      });
    } else {
      await prisma.obligation.create({
        data: {
          groupId: collegues.id,
          membershipId: joel.id,
          roundId: r.id,
          kind: 'CONTRIBUTION',
          amount: 10000,
          status: 'DUE',
          dueAt: r.dueAt,
        },
      });
    }
  }

  // Joël's fine from Round 3
  let joelFine = await prisma.obligation.findFirst({
    where: { membershipId: joel.id, roundId: round3.id, kind: 'FINE' },
  });
  if (!joelFine) {
    joelFine = await prisma.obligation.create({
      data: {
        groupId: collegues.id,
        membershipId: joel.id,
        roundId: round3.id,
        kind: 'FINE',
        amount: 1000,
        status: 'DUE',
        dueAt: round3.dueAt,
      },
    });
  } else {
    joelFine = await prisma.obligation.update({
      where: { id: joelFine.id },
      data: { status: 'DUE', dueAt: round3.dueAt, paidAt: null, onTime: null },
    });
  }

  // Helper to append a sealed ledger transaction
  async function appendEntry(entry: Omit<LedgerEntry, 'id' | 'seq' | 'prevHash' | 'hash'>) {
    const last = await prisma.ledgerTransaction.findFirst({
      where: { groupId: collegues.id },
      orderBy: { seq: 'desc' },
      select: { seq: true, hash: true },
    });
    const sealed = sealTransaction({
      groupId: collegues.id,
      previous: last,
      entry: { ...entry, id: randomUUID() },
    });
    await prisma.ledgerTransaction.create({
      data: {
        id: sealed.id,
        groupId: collegues.id,
        seq: sealed.seq,
        type: sealed.type,
        occurredAt: new Date(sealed.occurredAt),
        roundId: sealed.roundId,
        membershipId: sealed.membershipId,
        refType: sealed.refType,
        refId: sealed.refId,
        descriptionFr: sealed.descriptionFr,
        descriptionEn: sealed.descriptionEn,
        metadata: sealed.metadata,
        prevHash: sealed.prevHash,
        hash: sealed.hash,
        postings: {
          createMany: {
            data: sealed.postings.map((p) => ({ account: p.account, amount: p.amount })),
          },
        },
      },
    });
  }

  // Joël FINE_ASSESSED entry
  const hasFineTx = await prisma.ledgerTransaction.findFirst({
    where: { groupId: collegues.id, type: 'FINE_ASSESSED', membershipId: joel.id },
  });
  if (!hasFineTx) {
    console.log('Appending FINE_ASSESSED for Joël...');
    await appendEntry({
      type: 'FINE_ASSESSED',
      occurredAt: round3.dueAt.toISOString(),
      roundId: round3.id,
      membershipId: joel.id,
      refType: 'Obligation',
      refId: joelFine.id,
      descriptionFr: 'Amende de retard, tour 3',
      descriptionEn: 'Late fine, round 3',
      metadata: {
        deadline: round3.dueAt.toISOString(),
        roundNumber: 3,
        reason: 'ROUND_LATE',
      },
      postings: fineAssessedPostings({ membershipId: joel.id, amount: 1000 }),
    });
  }

  // Fund General Fund with 50 000 FCFA
  const hasGeneralFund = await prisma.ledgerTransaction.findFirst({
    where: { groupId: collegues.id, descriptionFr: 'Dotation fonds de réserve' },
  });
  if (!hasGeneralFund) {
    console.log('Seeding general fund (50 000 FCFA)...');
    await appendEntry({
      type: 'FINE_ASSESSED',
      occurredAt: yesterday.toISOString(),
      roundId: null,
      membershipId: nkam.id,
      refType: 'System',
      refId: 'seed-general',
      descriptionFr: 'Dotation fonds de réserve',
      descriptionEn: 'Reserve fund seed',
      metadata: {},
      postings: fineAssessedPostings({ membershipId: nkam.id, amount: 50000 }),
    });
    const payRes = paymentReceivedPostings({
      payerMembershipId: nkam.id,
      fee: 0,
      feeSource: 'PROVIDER',
      parts: [{ kind: 'DEBT', amount: 50000, ref: 'seed-general' }],
    });
    await appendEntry({
      type: 'PAYMENT_RECEIVED',
      occurredAt: yesterday.toISOString(),
      roundId: null,
      membershipId: nkam.id,
      refType: 'System',
      refId: 'seed-general-pay',
      descriptionFr: 'Versement fonds de réserve',
      descriptionEn: 'Reserve fund deposit',
      metadata: payRes.metadata,
      postings: payRes.postings,
    });
  }

  // Extra 30 000 FCFA cash injection so Paul's loan limit reaches 30 000
  // (cash must exceed payables + solidarityFund + 30 000 for availableForLoans to allow it)
  const hasLoanFund = await prisma.ledgerTransaction.findFirst({
    where: { groupId: collegues.id, descriptionFr: 'Dotation fonds de prêt' },
  });
  if (!hasLoanFund) {
    console.log('Seeding loan fund injection (30 000 FCFA)...');
    await appendEntry({
      type: 'FINE_ASSESSED',
      occurredAt: yesterday.toISOString(),
      roundId: null,
      membershipId: nkam.id,
      refType: 'System',
      refId: 'seed-loan-fund',
      descriptionFr: 'Dotation fonds de prêt',
      descriptionEn: 'Loan fund seed',
      metadata: {},
      postings: fineAssessedPostings({ membershipId: nkam.id, amount: 30000 }),
    });
    const payLoan = paymentReceivedPostings({
      payerMembershipId: nkam.id,
      fee: 0,
      feeSource: 'PROVIDER',
      parts: [{ kind: 'DEBT', amount: 30000, ref: 'seed-loan-fund' }],
    });
    await appendEntry({
      type: 'PAYMENT_RECEIVED',
      occurredAt: yesterday.toISOString(),
      roundId: null,
      membershipId: nkam.id,
      refType: 'System',
      refId: 'seed-loan-fund-pay',
      descriptionFr: 'Versement fonds de prêt',
      descriptionEn: 'Loan fund deposit',
      metadata: payLoan.metadata,
      postings: payLoan.postings,
    });
  }

  // Top-up: 500 FCFA extra so the disbursement-fee reserve doesn't eat into the 30 000 limit
  // (loanLimit = min(byContributions, maxAmountWithinFee(available)): need available >= 30 450)
  const hasLoanTopUp = await prisma.ledgerTransaction.findFirst({
    where: { groupId: collegues.id, descriptionFr: 'Complément fonds de prêt' },
  });
  if (!hasLoanTopUp) {
    console.log('Seeding loan fund top-up (500 FCFA)...');
    await appendEntry({
      type: 'FINE_ASSESSED',
      occurredAt: yesterday.toISOString(),
      roundId: null,
      membershipId: nkam.id,
      refType: 'System',
      refId: 'seed-loan-topup',
      descriptionFr: 'Complément fonds de prêt',
      descriptionEn: 'Loan fund top-up',
      metadata: {},
      postings: fineAssessedPostings({ membershipId: nkam.id, amount: 500 }),
    });
    const payTopUp = paymentReceivedPostings({
      payerMembershipId: nkam.id,
      fee: 0,
      feeSource: 'PROVIDER',
      parts: [{ kind: 'DEBT', amount: 500, ref: 'seed-loan-topup' }],
    });
    await appendEntry({
      type: 'PAYMENT_RECEIVED',
      occurredAt: yesterday.toISOString(),
      roundId: null,
      membershipId: nkam.id,
      refType: 'System',
      refId: 'seed-loan-topup-pay',
      descriptionFr: 'Versement complément fonds de prêt',
      descriptionEn: 'Loan fund top-up deposit',
      metadata: payTopUp.metadata,
      postings: payTopUp.postings,
    });
  }

  // Carine: fund payable balance (90 000 FCFA)
  const hasCarinePayable = await prisma.ledgerTransaction.findFirst({
    where: { groupId: collegues.id, descriptionFr: 'Attribution cagnotte Carine' },
  });
  if (!hasCarinePayable) {
    console.log('Seeding Carine payable balance (90 000 FCFA)...');
    const payCarine = paymentReceivedPostings({
      payerMembershipId: nkam.id,
      fee: 0,
      feeSource: 'PROVIDER',
      parts: [
        {
          kind: 'CONTRIBUTION',
          amount: 90000,
          creditorMembershipId: carine.id,
          roundId: round3.id,
        },
      ],
    });
    await appendEntry({
      type: 'PAYMENT_RECEIVED',
      occurredAt: yesterday.toISOString(),
      roundId: round3.id,
      membershipId: nkam.id,
      refType: 'PaymentIntent',
      refId: randomUUID(),
      descriptionFr: 'Attribution cagnotte Carine',
      descriptionEn: 'Carine pot allocation',
      metadata: payCarine.metadata,
      postings: payCarine.postings,
    });
  }

  console.log('Eval world seeded successfully!');
  await prisma.$disconnect();
}

main().catch(console.error);
