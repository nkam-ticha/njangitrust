// A group with a real ledger for the statement and audit export tests: the chat world's four active
// members, a first cycle drawn the verifiable way, round 1 paid by everyone (one member late and
// fined), and the beneficiary's withdrawal. Every entry is built with the rules package's posting
// builders and sealed into the group's hash chain, as the ledger service will do.
import { randomUUID } from 'node:crypto';
import {
  completionType,
  cycleStartedEvent,
  disbursementCompletedPostings,
  fineAssessedPostings,
  genesisHash,
  paymentReceivedPostings,
  withdrawalSentPostings,
  type LedgerTransaction,
} from '@njangi/rules';
import { getPrisma } from '../../src/lib/prisma';
import { chatWorld, type ChatWorld, type Member } from './chat-world';
import { appendLedger, entryOf } from './ledger-seed';

/** Instants of the scenario, all in October 2026 (Douala is UTC+1). */
export const AT = {
  draw: '2026-10-01T08:00:00.000Z',
  paid: '2026-10-15T10:00:00.000Z',
  due: '2026-10-20T17:00:00.000Z',
  late: '2026-10-21T09:00:00.000Z',
  payout: '2026-10-21T17:00:00.000Z',
  withdrawal: '2026-10-22T08:00:00.000Z',
} as const;

export const OCTOBER = { kind: 'MONTH', year: 2026, month: 10 } as const;

/** E1: 10 000 + 1 000 with a 100 FCFA fee: the contribution bears 91, the beneficiary gets 9 909. */
export const CONTRIBUTION = 10_000;
export const SOLIDARITY = 1_000;
export const NET_PER_PAYMENT = 9_909;
export const FINE = 1_000;
export const WITHDRAWAL_FEE = 500;

export interface StatementWorld extends ChatWorld {
  /** The four active members, in rotation order. */
  rotation: Member[];
  beneficiary: Member;
  /** Paid after the deadline and was fined. */
  lateMember: Member;
  roundId: string;
  /** What the beneficiary was credited and then withdrew (fee on top). */
  payoutTotal: number;
  withdrawn: number;
  chain: LedgerTransaction[];
}

export async function statementWorld(): Promise<StatementWorld> {
  const world = await chatWorld();
  const prisma = getPrisma();
  const active = [world.admin, world.bea, world.carl, world.dina];
  const draw = cycleStartedEvent({
    groupId: world.groupId,
    cycleNumber: 1,
    mode: 'FIXED',
    latestLedgerHash: genesisHash(world.groupId),
    activeMembershipIds: active.map((m) => m.membershipId),
  });
  const rotation = draw.order.map((id) => active.find((m) => m.membershipId === id)!);
  const beneficiary = rotation[0]!;
  const lateMember = rotation[1]!;

  const cycle = await prisma.cycle.findFirstOrThrow({
    where: { groupId: world.groupId, number: 1 },
  });
  await prisma.cycle.update({
    where: { id: cycle.id },
    data: { drawSeed: draw.drawSeed, rotation: draw.order, startedAt: new Date(AT.draw) },
  });
  const round = await prisma.round.create({
    data: {
      groupId: world.groupId,
      cycleId: cycle.id,
      number: 1,
      beneficiaryMembershipId: beneficiary.membershipId,
      dueAt: new Date(AT.due),
      payoutAt: new Date(AT.payout),
      status: 'CLOSED',
      ruleSetVersion: 1,
    },
  });

  const entries = [
    entryOf('EVENT', [], {
      metadata: draw,
      occurredAt: AT.draw,
      descriptionFr: 'Tirage du cycle 1',
      descriptionEn: 'Draw of cycle 1',
    }),
  ];
  const payment = async (member: Member) => {
    const late = member === lateMember;
    const paidAt = new Date(late ? AT.late : AT.paid);
    const base = {
      groupId: world.groupId,
      membershipId: member.membershipId,
      roundId: round.id,
      dueAt: new Date(AT.due),
      status: 'PAID' as const,
      paidAt,
      onTime: !late,
    };
    const contribution = await prisma.obligation.create({
      data: {
        ...base,
        kind: 'CONTRIBUTION',
        amount: CONTRIBUTION,
        creditorMembershipId: beneficiary.membershipId,
      },
    });
    const solidarity = await prisma.obligation.create({
      data: { ...base, kind: 'SOLIDARITY', amount: SOLIDARITY },
    });
    return entryOf(
      'PAYMENT_RECEIVED',
      paymentReceivedPostings({
        payerMembershipId: member.membershipId,
        fee: 100,
        feeSource: 'SCHEDULE',
        parts: [
          {
            kind: 'CONTRIBUTION',
            amount: CONTRIBUTION,
            creditorMembershipId: beneficiary.membershipId,
            tieOrder: 1,
            ref: contribution.id,
          },
          { kind: 'SOLIDARITY', amount: SOLIDARITY, ref: solidarity.id },
        ],
      }),
      {
        membershipId: member.membershipId,
        roundId: round.id,
        refType: 'PAYMENT_INTENT',
        refId: randomUUID(),
        occurredAt: paidAt.toISOString(),
      },
    );
  };
  for (const member of rotation.filter((m) => m !== lateMember))
    entries.push(await payment(member));
  entries.push(
    entryOf(
      'FINE_ASSESSED',
      fineAssessedPostings({ membershipId: lateMember.membershipId, amount: FINE }),
      { membershipId: lateMember.membershipId, roundId: round.id, occurredAt: AT.due },
    ),
  );
  entries.push(await payment(lateMember));

  const payoutTotal = NET_PER_PAYMENT * rotation.length;
  const withdrawn = payoutTotal - WITHDRAWAL_FEE;
  const operationId = randomUUID();
  entries.push(
    entryOf(
      'DISBURSEMENT_SENT',
      withdrawalSentPostings({
        operationId,
        membershipId: beneficiary.membershipId,
        amount: withdrawn,
        feeEstimated: WITHDRAWAL_FEE,
      }),
      { membershipId: beneficiary.membershipId, occurredAt: AT.withdrawal },
    ),
    entryOf(
      completionType('WITHDRAWAL'),
      disbursementCompletedPostings({
        operationId,
        amount: withdrawn,
        feeEstimated: WITHDRAWAL_FEE,
        feeActual: WITHDRAWAL_FEE,
        feeSource: 'PROVIDER',
      }),
      { membershipId: beneficiary.membershipId, occurredAt: AT.withdrawal },
    ),
  );
  const chain = await appendLedger(world.groupId, entries);
  return {
    ...world,
    rotation,
    beneficiary,
    lateMember,
    roundId: round.id,
    payoutTotal,
    withdrawn,
    chain,
  };
}
