// Steps for tests of a whole cycle on the real services: pay a round, reach its payout, play every
// round of a group made by `realGroup`, seed the general fund. Time moves with the test clock only.
import { paymentReceivedPostings, fineAssessedPostings } from '@njangi/rules';
import { expect } from 'vitest';
import { settleBackground } from '../../src/jobs/dispatch';
import { clock, setTestClock } from '../../src/lib/clock';
import { getPrisma } from '../../src/lib/prisma';
import { assessRoundFines } from '../../src/modules/fines/fines.service';
import { pollPaymentIntent } from '../../src/modules/payments';
import { openPayout } from '../../src/modules/payouts';
import { openRound } from '../../src/modules/cycles';
import { MOCK_CONFIRMATION_MS } from '../../src/modules/providers/mock-provider';
import { api } from './client';
import { confirm } from './factories';
import type { Member } from './governance';
import { appendLedger, entryOf } from './ledger-seed';

/** Moves the test clock forward to `at` (never back). */
export function goTo(at: Date): void {
  if (at.getTime() > clock.now().getTime()) setTestClock(at);
}

/** A member signs in again: after a jump of weeks their session is long gone (D27). */
export async function relogin(member: Member): Promise<Member> {
  const res = await api(null, { ownPhones: [member.phone, member.paymentNumber] }).post(
    '/v1/auth/login',
    { phone: member.phone, pin: member.pin },
  );
  expect(res.status).toBe(200);
  return { ...member, accessToken: res.body.session.accessToken as string };
}

/** Pays everything the member owes for round `roundNumber` and lets the operator confirm. */
export async function payRound(groupId: string, who: Member, roundNumber: number): Promise<void> {
  const member = await relogin(who);
  const dues = await api(member).get(`/v1/groups/${groupId}/me/dues`);
  const obligationIds = (dues.body.dues as { id: string; roundNumber: number | null }[])
    .filter((due) => due.roundNumber === roundNumber)
    .map((due) => due.id);
  expect(obligationIds.length).toBeGreaterThan(0);
  const card = await api(member).post(`/v1/groups/${groupId}/payments`, { obligationIds });
  expect(card.status).toBe(201);
  const done = await confirm(member, card.body.action.id);
  expect(done.status).toBe(200);
  goTo(new Date(clock.now().getTime() + MOCK_CONFIRMATION_MS + 1_000));
  await pollPaymentIntent(String(done.body.action.result.ref));
  await settleBackground();
}

export interface PlayOptions {
  /** Members who do not pay the given round (their obligations stay DUE; a fine is assessed). */
  unpaid?: { member: Member; round: number }[];
}

/**
 * Plays every round of the group's current cycle: open it, everyone pays, reach its payout.
 * Ends just after the last payout, with the cycle still open (the close job has not run).
 */
export async function playCycle(
  groupId: string,
  everyone: readonly Member[],
  options: PlayOptions = {},
): Promise<void> {
  const group = await getPrisma().group.findUniqueOrThrow({
    where: { id: groupId },
    select: { currentCycleId: true },
  });
  const rounds = await getPrisma().round.findMany({
    where: { cycleId: group.currentCycleId! },
    orderBy: { number: 'asc' },
  });
  for (const round of rounds) {
    if (round.number > 1) {
      const before = rounds[round.number - 2]!;
      goTo(new Date(before.payoutAt.getTime() + 60_000));
      expect(await openRound(round.id)).toBe(true);
    }
    for (const member of everyone) {
      if (
        options.unpaid?.some(
          (u) => u.member.membershipId === member.membershipId && u.round === round.number,
        )
      )
        continue;
      await payRound(groupId, member, round.number);
    }
    const fresh = await getPrisma().round.findUniqueOrThrow({ where: { id: round.id } });
    goTo(new Date(fresh.payoutAt.getTime() + 60_000));
    if (options.unpaid?.some((u) => u.round === round.number)) await assessRoundFines(round.id);
    expect(await openPayout(round.id)).toBe(true);
  }
}

/**
 * Gives the general fund real, collected money: a fine on `membershipId` and its payment
 * (cash +amount, fund +amount, no debt left), through the ledger's own builders.
 */
export async function seedGeneralFund(
  groupId: string,
  membershipId: string,
  amount: number,
): Promise<void> {
  await appendLedger(groupId, [
    entryOf('FINE_ASSESSED', fineAssessedPostings({ membershipId, amount }), { membershipId }),
    entryOf(
      'PAYMENT_RECEIVED',
      paymentReceivedPostings({
        payerMembershipId: membershipId,
        fee: 0,
        feeSource: 'PROVIDER',
        parts: [{ kind: 'DEBT', amount, ref: 'seed' }],
      }),
      { membershipId },
    ),
  ]);
}
