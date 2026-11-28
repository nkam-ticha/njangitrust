// R8 bidding close: choose the highest/earliest bid or a verifiable draw, publish bids, assign the
// pot and assess the winning debt. The round row lock makes the transition idempotent.
import {
  closeBidding as determineBiddingOutcome,
  bidAssessedPostings,
  genesisHash,
  accountBalance,
  potAccount,
  potAssignedPostings,
  type GovernanceEvent,
} from '@njangi/rules';
import type { Job } from 'bullmq';
import { clock } from '../../lib/clock';
import { getPrisma } from '../../lib/prisma';
import { registerJob, registerRepeatable } from '../../jobs/registry';
import { lockGroup } from '../../permissions';
import { appendLedgerEntry, ledgerHead } from '../ledger';

function eventText(event: { event: string; roundNumber: number }) {
  return event.event === 'BIDS_PUBLISHED'
    ? {
        descriptionFr: `Enchères publiées, tour ${event.roundNumber}`,
        descriptionEn: `Bids published, round ${event.roundNumber}`,
      }
    : {
        descriptionFr: `Tirage du bénéficiaire, tour ${event.roundNumber}`,
        descriptionEn: `Beneficiary draw, round ${event.roundNumber}`,
      };
}

/**
 * Thrown inside the closing's transaction when the beneficiary could not be recorded: it rolls back
 * every ledger and obligation row written before (returning from the callback would commit them).
 */
class BidNotAssigned extends Error {}

export async function closeBidding(roundId: string, now = clock.now()): Promise<boolean> {
  try {
    return await closeBiddingOnce(roundId, now);
  } catch (error) {
    if (error instanceof BidNotAssigned) return false;
    throw error;
  }
}

async function closeBiddingOnce(roundId: string, now: Date): Promise<boolean> {
  const db = getPrisma();
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Round" WHERE "id" = ${roundId}::uuid FOR UPDATE`;
    const round = await tx.round.findUnique({
      where: { id: roundId },
      include: {
        cycle: {
          select: {
            number: true,
            mode: true,
            rotation: true,
            rounds: {
              orderBy: { number: 'asc' },
              select: { number: true, beneficiaryMembershipId: true },
            },
          },
        },
      },
    });
    if (
      !round ||
      round.cycle.mode !== 'BIDDING' ||
      // Only a round that is open for contributions is closed: a round still scheduled, or already
      // paid out, has no bids to close (R8.3).
      round.status !== 'OPEN' ||
      round.dueAt > now ||
      round.beneficiaryMembershipId
    )
      return false;
    // Round first, then the group (the order fines.service uses). The ledger head and the pot below
    // are read under the group lock: a payment that lands after them would leave money in the pot
    // of a round whose pot was already assigned.
    await lockGroup(tx, round.groupId, 'update');
    const served = round.cycle.rounds
      .filter((item) => item.number < round.number)
      .flatMap((item) => (item.beneficiaryMembershipId ? [item.beneficiaryMembershipId] : []));
    const eligible = round.cycle.rotation.filter((membershipId) => !served.includes(membershipId));
    if (eligible.length === 0) return false;
    const bids = await tx.bid.findMany({
      where: { roundId, membershipId: { in: eligible } },
      select: { membershipId: true, amount: true, updatedAt: true },
    });
    const head = await ledgerHead(tx, round.groupId);
    const outcome = determineBiddingOutcome({
      groupId: round.groupId,
      cycleNumber: round.cycle.number,
      roundNumber: round.number,
      roundId: round.id,
      latestLedgerHash: head?.hash ?? genesisHash(round.groupId),
      eligibleMembershipIds: eligible,
      bids: bids.map((bid) => ({
        membershipId: bid.membershipId,
        amount: bid.amount,
        reachedAt: bid.updatedAt,
      })),
    });
    const beneficiaryMembershipId = outcome.beneficiaryMembershipId;
    if (outcome.outcome === 'WINNING_BID') {
      const event = {
        event: 'BIDS_PUBLISHED',
        cycleNumber: round.cycle.number,
        roundNumber: round.number,
        roundId: round.id,
        beneficiaryMembershipId,
        bids: outcome.publishedBids,
      } satisfies GovernanceEvent;
      const text = eventText(event);
      await appendLedgerEntry(tx, round.groupId, {
        type: 'EVENT',
        occurredAt: now.toISOString(),
        roundId: round.id,
        membershipId: beneficiaryMembershipId,
        refType: 'Round',
        refId: round.id,
        ...text,
        metadata: event,
        postings: [],
      });
      if (outcome.amount > 0) {
        const debt = await tx.obligation.create({
          data: {
            groupId: round.groupId,
            membershipId: beneficiaryMembershipId,
            kind: 'BID',
            amount: outcome.amount,
            dueAt: round.payoutAt,
            roundId,
          },
        });
        await appendLedgerEntry(tx, round.groupId, {
          type: 'BID_ASSESSED',
          occurredAt: now.toISOString(),
          roundId: round.id,
          membershipId: beneficiaryMembershipId,
          refType: 'Obligation',
          refId: debt.id,
          descriptionFr: `Enchère gagnante, tour ${round.number}`,
          descriptionEn: `Winning bid, round ${round.number}`,
          metadata: { obligationId: debt.id, amount: outcome.amount, roundNumber: round.number },
          postings: bidAssessedPostings({
            membershipId: beneficiaryMembershipId,
            amount: outcome.amount,
          }),
        });
      }
    } else if (outcome.outcome === 'DRAW') {
      const text = eventText(outcome.event);
      await appendLedgerEntry(tx, round.groupId, {
        type: 'EVENT',
        occurredAt: now.toISOString(),
        roundId: round.id,
        membershipId: beneficiaryMembershipId,
        refType: 'Round',
        refId: round.id,
        ...text,
        metadata: outcome.event,
        postings: [],
      });
    }
    const assigned = await tx.round.updateMany({
      where: { id: round.id, beneficiaryMembershipId: null, status: 'OPEN' },
      data: { beneficiaryMembershipId },
    });
    if (assigned.count !== 1) throw new BidNotAssigned();
    const entries = await tx.ledgerTransaction.findMany({
      where: { groupId: round.groupId },
      include: { postings: { select: { account: true, amount: true } } },
      orderBy: { seq: 'asc' },
    });
    const account = potAccount(round.id);
    const pot = accountBalance(
      account,
      entries.flatMap((entry) => entry.postings),
    );
    if (pot > 0) {
      await appendLedgerEntry(tx, round.groupId, {
        type: 'POT_ASSIGNED',
        occurredAt: now.toISOString(),
        roundId: round.id,
        membershipId: beneficiaryMembershipId,
        refType: 'Round',
        refId: round.id,
        descriptionFr: `Pot attribué, tour ${round.number}`,
        descriptionEn: `Pot assigned, round ${round.number}`,
        metadata: { beneficiaryMembershipId, amount: pot },
        postings: potAssignedPostings({ roundId: round.id, beneficiaryMembershipId, amount: pot }),
      });
    }
    return true;
  });
}

export async function closeDueBidding(now = clock.now()): Promise<number> {
  const due = await getPrisma().round.findMany({
    where: {
      status: 'OPEN',
      beneficiaryMembershipId: null,
      dueAt: { lte: now },
      cycle: { mode: 'BIDDING' },
      // D28: a closed group takes no new activity.
      group: { status: { not: 'CLOSED' } },
    },
    select: { id: true },
    orderBy: { dueAt: 'asc' },
    take: 100,
  });
  let closed = 0;
  for (const round of due) if (await closeBidding(round.id, now)) closed += 1;
  return closed;
}

export function registerBiddingJobs(): void {
  registerJob({
    name: 'bidding.close',
    keepNoHistory: true,
    process: async (_job: Job) => {
      await closeDueBidding();
    },
  });
  registerRepeatable({ id: 'bidding.close.scan', name: 'bidding.close', pattern: '*/5 * * * *' });
}
