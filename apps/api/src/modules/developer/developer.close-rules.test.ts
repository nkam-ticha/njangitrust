// What may stop a developer from closing a group or deleting an account (D28): money still held
// in the group, operations really in flight (and not approved payouts that were never sent), and
// the lock order shared with a confirmation (its card, then the group, then the member).
import { randomUUID } from 'node:crypto';
import { paymentReceivedPostings, potAssignedPostings } from '@njangi/rules';
import { describe, expect, it } from 'vitest';
import { getPrisma } from '../../lib/prisma';
import { lockGroup } from '../../permissions';
import {
  developerCall,
  developerToken,
  sleep,
  useDeveloperEnv,
  watch,
} from '../../../test/helpers/developer';
import { addMember, createGroup, signUp } from '../../../test/helpers/factories';
import { propose, startedGroup } from '../../../test/helpers/governance';
import { appendLedger, entryOf } from '../../../test/helpers/ledger-seed';

useDeveloperEnv();

const prisma = () => getPrisma();
const closePath = (groupId: string) => `/v1/developer/groups/${groupId}/close`;
const groupPath = (groupId: string) => `/v1/developer/groups/${groupId}`;
const userPath = (userId: string) => `/v1/developer/users/${userId}`;

describe('closing a group while members still hold money in it', () => {
  it('refuses with the counts while a debt is due, and closes once it is cleared', async () => {
    const token = await developerToken();
    const { groupId, members } = await startedGroup(3);
    const debt = await prisma().obligation.create({
      data: {
        groupId,
        membershipId: members[0]!.membershipId,
        kind: 'FINE',
        amount: 1_000,
        dueAt: new Date(Date.now() + 86_400_000),
      },
    });

    const detail = await developerCall(token, 'get', groupPath(groupId));
    expect(detail.body.group.heldMoney).toEqual({ obligations: 1, loans: 0, balances: 0, pots: 0 });

    const refused = await developerCall(token, 'post', closePath(groupId));
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('GROUP_MEMBERS_HOLD_MONEY');
    expect(refused.body.details).toEqual({ obligations: 1, loans: 0, balances: 0, pots: 0 });
    expect(refused.body.messageFr).toMatch(/Attends/);
    expect(refused.body.messageEn).toMatch(/settled/);
    expect(await prisma().group.findUniqueOrThrow({ where: { id: groupId } })).toMatchObject({
      status: 'ACTIVE',
      hiddenByDeveloperAt: null,
    });

    await prisma().obligation.update({ where: { id: debt.id }, data: { status: 'CANCELLED' } });
    expect((await developerCall(token, 'post', closePath(groupId))).status).toBe(200);
  });

  it('refuses while a member holds a balance in the ledger', async () => {
    const token = await developerToken();
    const { groupId, members } = await startedGroup(3);
    const [creditor, payer] = [members[0]!, members[1]!];
    await appendLedger(groupId, [
      entryOf(
        'PAYMENT_RECEIVED',
        paymentReceivedPostings({
          payerMembershipId: payer.membershipId,
          fee: 100,
          feeSource: 'SCHEDULE',
          parts: [
            {
              kind: 'CONTRIBUTION',
              amount: 10_000,
              creditorMembershipId: creditor.membershipId,
              tieOrder: 1,
            },
          ],
        }),
        { membershipId: payer.membershipId },
      ),
    ]);
    const refused = await developerCall(token, 'post', closePath(groupId));
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('GROUP_MEMBERS_HOLD_MONEY');
    expect(refused.body.details.balances).toBeGreaterThanOrEqual(1);
  });

  /** A contribution paid into a bidding round's pot (D10): 9 900 FCFA net of the 100 fee. */
  const potPayment = (payer: string, roundId: string) =>
    entryOf(
      'PAYMENT_RECEIVED',
      paymentReceivedPostings({
        payerMembershipId: payer,
        fee: 100,
        feeSource: 'SCHEDULE',
        parts: [{ kind: 'CONTRIBUTION', amount: 10_000, potRoundId: roundId, tieOrder: 1 }],
      }),
      { membershipId: payer },
    );

  it('refuses while a bidding pot still holds contributions (D10), and says so in the counts', async () => {
    const token = await developerToken();
    const { groupId, members } = await startedGroup(3);
    // Contributions paid before the bids close sit in the round's pot, which no member owns yet.
    // Closing the group would leave it unassigned for good (the bidding close skips closed groups).
    await appendLedger(groupId, [potPayment(members[1]!.membershipId, randomUUID())]);
    const detail = await developerCall(token, 'get', groupPath(groupId));
    expect(detail.body.group.heldMoney).toEqual({ obligations: 0, loans: 0, balances: 0, pots: 1 });

    const refused = await developerCall(token, 'post', closePath(groupId));
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('GROUP_MEMBERS_HOLD_MONEY');
    expect(refused.body.details).toEqual({ obligations: 0, loans: 0, balances: 0, pots: 1 });
    const still = await prisma().group.findUniqueOrThrow({ where: { id: groupId } });
    expect(still.status).not.toBe('CLOSED');
    expect(still.hiddenByDeveloperAt).toBeNull();
  });

  it('does not count a pot that was assigned, nor another group’s pot', async () => {
    const token = await developerToken();
    const { groupId, members } = await startedGroup(3);
    const other = await startedGroup(3);
    const roundId = randomUUID();
    await appendLedger(other.groupId, [potPayment(other.members[1]!.membershipId, randomUUID())]);
    await appendLedger(groupId, [
      potPayment(members[1]!.membershipId, roundId),
      entryOf(
        'POT_ASSIGNED',
        potAssignedPostings({
          roundId,
          beneficiaryMembershipId: members[0]!.membershipId,
          amount: 9_900,
        }),
        { membershipId: members[0]!.membershipId },
      ),
    ]);
    const detail = await developerCall(token, 'get', groupPath(groupId));
    // The assigned pot is the winner's balance now, not a pot.
    expect(detail.body.group.heldMoney).toMatchObject({ pots: 0, balances: 1 });
  });

  it('refuses while a loan is approved and not sent yet (money-to-be), and when it is over closes', async () => {
    const token = await developerToken();
    const { groupId, members } = await startedGroup(3);
    const loan = await prisma().loan.create({
      data: {
        groupId,
        membershipId: members[0]!.membershipId,
        principal: 30_000,
        months: 3,
        ratePermille: 20,
        interest: 1_800,
        feeEstimated: 500,
        totalDue: 31_800,
        status: 'APPROVED',
      },
    });
    const refused = await developerCall(token, 'post', closePath(groupId));
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('GROUP_MEMBERS_HOLD_MONEY');
    expect(refused.body.details).toEqual({ obligations: 0, loans: 1, balances: 0, pots: 0 });

    // A loan that ended (repaid, refused) holds nothing.
    await prisma().loan.update({ where: { id: loan.id }, data: { status: 'REPAID' } });
    expect((await developerCall(token, 'post', closePath(groupId))).status).toBe(200);
  });

  it('refuses as a whole: the votes it would have ended stay open', async () => {
    const token = await developerToken();
    const { groupId, admin, members } = await startedGroup(3);
    const proposalId = await propose(admin, groupId, {
      type: 'RULE_CHANGE',
      changes: { minBid: 800 },
    });
    await prisma().obligation.create({
      data: {
        groupId,
        membershipId: members[0]!.membershipId,
        kind: 'FINE',
        amount: 500,
        dueAt: new Date(Date.now() + 86_400_000),
      },
    });
    const chainBefore = await prisma().ledgerTransaction.count({ where: { groupId } });
    expect((await developerCall(token, 'post', closePath(groupId))).status).toBe(409);
    expect((await prisma().proposal.findUniqueOrThrow({ where: { id: proposalId } })).status).toBe(
      'OPEN',
    );
    // The closing event the vote would have written was rolled back with it.
    expect(await prisma().ledgerTransaction.count({ where: { groupId } })).toBe(chainBefore);
  });
});

describe('what counts as money in flight when closing', () => {
  it('does not wait for an approved payout that was never sent', async () => {
    const token = await developerToken();
    const { groupId, members } = await startedGroup(3);
    await prisma().solidarityRequest.create({
      data: {
        groupId,
        requesterMembershipId: members[0]!.membershipId,
        recipientMembershipId: members[1]!.membershipId,
        event: 'MALADIE',
        amount: 5_000,
        status: 'APPROVED',
      },
    });
    const detail = await developerCall(token, 'get', groupPath(groupId));
    // Shown as information, not as a blocker.
    expect(detail.body.group.inFlight.approvedPayouts).toBe(1);
    const closed = await developerCall(token, 'post', closePath(groupId));
    expect(closed.status).toBe(200);
  });

  it('still waits for a send that was started (CREATED, PENDING or EXPIRED)', async () => {
    const token = await developerToken();
    for (const status of ['CREATED', 'PENDING', 'EXPIRED'] as const) {
      const { groupId, members } = await startedGroup(3);
      await prisma().disbursement.create({
        data: {
          groupId,
          membershipId: members[0]!.membershipId,
          purpose: 'WITHDRAWAL',
          amount: 5_000,
          feeEstimated: 100,
          phoneSnapshot: 'test',
          provider: 'mock',
          status,
        },
      });
      const refused = await developerCall(token, 'post', closePath(groupId));
      expect(refused.status, status).toBe(409);
      expect(refused.body.code).toBe('GROUP_MONEY_IN_FLIGHT');
    }
  });
});

describe('deleting an account against a card being confirmed', () => {
  it('does not deadlock: the deletion waits for the card, then sees the operation', async () => {
    const token = await developerToken();
    const admin = await signUp();
    const { groupId } = await createGroup(admin);
    const member = await addMember(admin, groupId);
    const card = await prisma().pendingAction.create({
      data: {
        userId: member.id,
        groupId,
        type: 'PAY',
        args: {},
        preview: {},
        level: 'L1',
        status: 'PENDING',
        origin: 'UI',
        expiresAt: new Date(Date.now() + 600_000),
      },
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let claimed!: () => void;
    const claimedFirst = new Promise<void>((resolve) => (claimed = resolve));

    // A confirmation of PAY: it claims its card first, then (later) the group and the member.
    const confirming = prisma().$transaction(
      async (tx) => {
        await tx.pendingAction.update({ where: { id: card.id }, data: { status: 'CONFIRMED' } });
        claimed();
        await gate;
        await lockGroup(tx, groupId, 'share');
        await tx.$queryRaw`SELECT "id" FROM "Membership" WHERE "id" = ${member.membershipId}::uuid FOR UPDATE`;
        await tx.paymentIntent.create({
          data: {
            groupId,
            membershipId: member.membershipId,
            obligationIds: [randomUUID()],
            amount: 1_000,
            phoneSnapshot: 'test',
            provider: 'mock',
            status: 'CREATED',
          },
        });
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    await claimedFirst;

    const deleting = watch(developerCall(token, 'delete', userPath(member.id)));
    await sleep(800);
    // The deletion holds nothing the confirmation needs yet: it waits on the card, first.
    expect(deleting.settled()).toBe(false);
    release();
    // Taking the group and the member first, as before, deadlocked here.
    await confirming;

    const res = await deleting.done;
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DELETE_OPERATION_IN_PROGRESS');
    expect((await prisma().user.findUniqueOrThrow({ where: { id: member.id } })).deletedAt).toBe(
      null,
    );
  });
});
