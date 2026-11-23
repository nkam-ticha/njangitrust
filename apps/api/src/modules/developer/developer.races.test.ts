// The developer console against concurrent work (D28): a group cannot be closed, and an account
// cannot be deleted, while a payment or withdrawal is being confirmed; a closed group stays out of
// members' reach. Each race is made deterministic by holding a transaction open the way a
// confirmation does (group lock, then member lock, rows not committed yet).
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getPrisma } from '../../lib/prisma';
import { runWithContext } from '../../lib/request-context';
import { authorizeGroup, lockGroup } from '../../permissions';
import { api } from '../../../test/helpers/client';
import {
  DEV_USERNAME,
  developerCall,
  developerToken,
  heldTransaction,
  sleep,
  useDeveloperEnv,
  watch,
} from '../../../test/helpers/developer';
import { addMember, createGroup, inviteToken, signUp } from '../../../test/helpers/factories';
import { propose, startedGroup } from '../../../test/helpers/governance';
import { AfterCommit } from '../../lib/after-commit';
import { audit } from '../audit';
import { payHandler } from '../payments';
import { withdrawHandler } from '../payouts';
import { settleProposal } from '../proposals';
import { generateMonthlyStatement } from '../statements';
import { meetingReminders } from '../meetings/meetings.jobs';

useDeveloperEnv();

const prisma = () => getPrisma();
const closePath = (groupId: string) => `/v1/developer/groups/${groupId}/close`;
const userPath = (userId: string) => `/v1/developer/users/${userId}`;

/** A card row as the confirmation of a payment or a withdrawal leaves it. */
function cardRow(input: {
  userId: string;
  groupId: string;
  type: 'PAY' | 'WITHDRAW';
  status: 'PENDING' | 'CONFIRMED';
}) {
  return prisma().pendingAction.create({
    data: {
      userId: input.userId,
      groupId: input.groupId,
      type: input.type,
      args: {},
      preview: {},
      level: 'L1',
      status: input.status,
      origin: 'UI',
      expiresAt: new Date(Date.now() + 600_000),
    },
  });
}

describe('closing a group while an operation is being confirmed', () => {
  it('waits for a payment being confirmed, then refuses because it exists', async () => {
    const token = await developerToken();
    const { groupId, members } = await startedGroup(3);
    const confirming = heldTransaction(async (tx) => {
      // What the confirmation of PAY does: the group lock first, then the operation row.
      await lockGroup(tx, groupId, 'share');
      await tx.paymentIntent.create({
        data: {
          groupId,
          membershipId: members[0]!.membershipId,
          obligationIds: [randomUUID()],
          amount: 1_000,
          phoneSnapshot: 'test',
          provider: 'mock',
          status: 'CREATED',
        },
      });
    });
    await confirming.ready;

    const closing = watch(developerCall(token, 'post', closePath(groupId)));
    await sleep(800);
    // Without the lock the close would already have counted nothing and committed.
    expect(closing.settled()).toBe(false);
    confirming.release();
    await confirming.finished;

    const res = await closing.done;
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('GROUP_MONEY_IN_FLIGHT');
    expect(await prisma().group.findUniqueOrThrow({ where: { id: groupId } })).toMatchObject({
      status: 'ACTIVE',
      hiddenByDeveloperAt: null,
    });
  });

  it('waits for a withdrawal being confirmed (exclusive group lock) and refuses too', async () => {
    const token = await developerToken();
    const { groupId, members } = await startedGroup(3);
    const confirming = heldTransaction(async (tx) => {
      await lockGroup(tx, groupId, 'update');
      await tx.disbursement.create({
        data: {
          groupId,
          membershipId: members[1]!.membershipId,
          purpose: 'WITHDRAWAL',
          amount: 5_000,
          feeEstimated: 100,
          phoneSnapshot: 'test',
          provider: 'mock',
          status: 'CREATED',
        },
      });
    });
    await confirming.ready;
    const closing = watch(developerCall(token, 'post', closePath(groupId)));
    await sleep(800);
    expect(closing.settled()).toBe(false);
    confirming.release();
    await confirming.finished;
    const res = await closing.done;
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('GROUP_MONEY_IN_FLIGHT');
  });

  it('counts a confirmed payment or withdrawal card as in flight until it is finished', async () => {
    const token = await developerToken();
    const { groupId, members } = await startedGroup(3);
    const card = await cardRow({
      userId: members[0]!.id,
      groupId,
      type: 'PAY',
      status: 'CONFIRMED',
    });
    const refused = await developerCall(token, 'post', closePath(groupId));
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('GROUP_MONEY_IN_FLIGHT');
    const detail = await developerCall(token, 'get', `/v1/developer/groups/${groupId}`);
    expect(detail.body.group.inFlight.openPayments).toBe(1);

    await prisma().pendingAction.update({ where: { id: card.id }, data: { status: 'DONE' } });
    const closed = await developerCall(token, 'post', closePath(groupId));
    expect(closed.status).toBe(200);
  });

  it('is not deadlocked by a card being confirmed, and that confirmation is then refused', async () => {
    const token = await developerToken();
    const { groupId, members } = await startedGroup(3);
    const member = members[0]!;
    const card = await cardRow({ userId: member.id, groupId, type: 'PAY', status: 'PENDING' });
    let closeFinished!: () => void;
    const closeOver = new Promise<void>((resolve) => (closeFinished = resolve));

    // A confirmation: it claims its card, then waits for the group lock the close already holds.
    const confirming = prisma().$transaction(
      async (tx) => {
        await tx.pendingAction.update({ where: { id: card.id }, data: { status: 'CONFIRMED' } });
        await Promise.race([closeOver, sleep(25_000)]);
        await lockGroup(tx, groupId, 'share');
        // The access check after the lock sees a group that is closed and hidden.
        await expect(
          authorizeGroup(member.id, groupId, 'group.payments.create', tx),
        ).rejects.toMatchObject({ code: 'GROUP_NOT_FOUND' });
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    await sleep(300);
    const closing = developerCall(token, 'post', closePath(groupId));
    void closing.then(closeFinished, closeFinished);
    // The close must finish while the claimed card is still locked: it skips that card instead of
    // waiting for it (waiting would deadlock with the confirmation's wait for the group).
    const [res] = await Promise.all([closing, confirming]);
    expect(res.status).toBe(200);
    expect(res.body.group).toMatchObject({ status: 'CLOSED', hidden: true });
  });
});

describe('the real PAY and WITHDRAW confirmations take the group lock first', () => {
  // A close in progress holds the group; the confirmation must wait for it (before any preview
  // reads the still-visible group) and then find the group closed and hidden.
  async function confirmDuringClose(
    handler: typeof payHandler | typeof withdrawHandler,
    args: Record<string, unknown>,
  ) {
    const { groupId, members } = await startedGroup(3);
    const member = members[0]!;
    const closing = heldTransaction(async (tx) => {
      await lockGroup(tx, groupId, 'update');
      await tx.group.update({
        where: { id: groupId },
        data: { status: 'CLOSED', hiddenByDeveloperAt: new Date() },
      });
    });
    await closing.ready;
    const effects = new AfterCommit();
    const confirming = watch(
      prisma().$transaction(
        (tx) =>
          (handler.execute as (ctx: unknown, input: unknown) => Promise<unknown>)(
            {
              userId: member.id,
              groupId,
              lang: 'fr',
              origin: 'UI',
              now: new Date(),
              db: tx,
              pendingActionId: randomUUID(),
              afterCommit: (effect: () => void) => effects.add(effect),
              effects,
            },
            { groupId, ...args },
          ),
        { timeout: 60_000, maxWait: 10_000 },
      ),
    );
    await sleep(800);
    const waiting = !confirming.settled();
    closing.release();
    await closing.finished;
    await expect(confirming.done).rejects.toMatchObject({ code: 'GROUP_NOT_FOUND' });
    return waiting;
  }

  it('PAY waits for a close in progress, then is refused', async () => {
    expect(await confirmDuringClose(payHandler, { obligationIds: [randomUUID()] })).toBe(true);
  });

  it('WITHDRAW waits for a close in progress, then is refused', async () => {
    expect(await confirmDuringClose(withdrawHandler, { amount: 1_000 })).toBe(true);
  });
});

describe('deleting an account while an operation is being confirmed', () => {
  it('waits for a payment being confirmed, then refuses because it exists', async () => {
    const token = await developerToken();
    const admin = await signUp();
    const { groupId } = await createGroup(admin);
    const member = await addMember(admin, groupId);
    const confirming = heldTransaction(async (tx) => {
      // What the confirmation of PAY does: group lock, member lock, then the operation row.
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
    });
    await confirming.ready;

    const deleting = watch(developerCall(token, 'delete', userPath(member.id)));
    await sleep(800);
    expect(deleting.settled()).toBe(false);
    confirming.release();
    await confirming.finished;

    const res = await deleting.done;
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DELETE_OPERATION_IN_PROGRESS');
    expect((await prisma().user.findUniqueOrThrow({ where: { id: member.id } })).deletedAt).toBe(
      null,
    );
  });

  it('counts a confirmed payment or withdrawal card of the person as an operation in progress', async () => {
    const token = await developerToken();
    const admin = await signUp();
    const { groupId } = await createGroup(admin);
    const member = await addMember(admin, groupId);
    const card = await cardRow({
      userId: member.id,
      groupId,
      type: 'WITHDRAW',
      status: 'CONFIRMED',
    });
    const res = await developerCall(token, 'delete', userPath(member.id));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DELETE_OPERATION_IN_PROGRESS');

    await prisma().pendingAction.update({ where: { id: card.id }, data: { status: 'FAILED' } });
    expect((await developerCall(token, 'delete', userPath(member.id))).status).toBe(200);
  });
});

describe('lock order between a close and a vote settling', () => {
  it('settles a vote only after taking the group lock, never holding the vote first', async () => {
    const { groupId, admin } = await startedGroup(3);
    const proposalId = await propose(admin, groupId, {
      type: 'RULE_CHANGE',
      changes: { minBid: 800 },
    });
    let settling: Promise<string> | undefined;
    let proposalFree = false;
    const holder = heldTransaction(async (tx) => {
      // The close's order: the group first.
      await lockGroup(tx, groupId, 'update');
      settling = settleProposal(proposalId);
      void settling.catch(() => undefined);
      await sleep(700);
      // The vote is not locked yet: settling is still waiting for the group. With the old order
      // (vote first, then group) this would fail at once: the row is held by the settling.
      await tx.$queryRaw`SELECT "id" FROM "Proposal" WHERE "id" = ${proposalId}::uuid FOR UPDATE NOWAIT`;
      proposalFree = true;
    });
    await holder.ready;
    expect(proposalFree).toBe(true);
    holder.release();
    await holder.finished;
    expect(['OPEN', 'PASSED', 'REJECTED', 'EXPIRED']).toContain(await settling);
  });
});

describe('a closed group stays out of members’ reach', () => {
  it('hides its notifications and unread count, keeps those with no group', async () => {
    const token = await developerToken();
    const { groupId, members } = await startedGroup(3);
    const member = members[0]!;
    const note = (withGroup: boolean) =>
      prisma().notification.create({
        data: {
          userId: member.id,
          groupId: withGroup ? groupId : null,
          category: 'GROUP',
          titleFr: 'Titre',
          titleEn: 'Title',
          bodyFr: 'Corps',
          bodyEn: 'Body',
        },
      });
    const inGroup = await note(true);
    const general = await note(false);
    const before = await api(member).get('/v1/notifications');
    const idsBefore = (before.body.notifications as { id: string }[]).map((n) => n.id);
    expect(idsBefore).toEqual(expect.arrayContaining([inGroup.id, general.id]));

    expect((await developerCall(token, 'post', closePath(groupId))).status).toBe(200);
    const after = await api(member).get('/v1/notifications');
    const idsAfter = (after.body.notifications as { id: string }[]).map((n) => n.id);
    expect(idsAfter).not.toContain(inGroup.id);
    expect(idsAfter).toContain(general.id);
    expect(after.body.unreadCount).toBeLessThan(before.body.unreadCount);
    expect((await api(member).get('/v1/notifications/unread-count')).body.unreadCount).toBe(
      after.body.unreadCount,
    );
  });

  it('answers an invite link of a closed group as not found, not as a closed group', async () => {
    const token = await developerToken();
    const admin = await signUp();
    const { groupId } = await createGroup(admin);
    const invitee = await signUp();
    const link = await inviteToken(admin, groupId, {
      name: 'Invitée',
      phone: (await prisma().user.findUniqueOrThrow({ where: { id: invitee.id } })).loginPhone,
    });
    expect((await api(null).get(`/v1/auth/invites/${link}`)).status).toBe(200);

    expect((await developerCall(token, 'post', closePath(groupId))).status).toBe(200);
    const res = await api(null).get(`/v1/auth/invites/${link}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('INVITE_NOT_FOUND');
  });

  it('writes no statement and sends no notice from a job queued before the close', async () => {
    const token = await developerToken();
    const { groupId, members } = await startedGroup(3);
    const member = members[0]!;
    expect((await developerCall(token, 'post', closePath(groupId))).status).toBe(200);
    const created = await generateMonthlyStatement({
      membershipId: member.membershipId,
      year: 2026,
      month: 10,
    });
    expect(created).toBe(false);
    expect(await prisma().statement.count({ where: { membershipId: member.membershipId } })).toBe(
      0,
    );
    expect(await prisma().notification.count({ where: { userId: member.id, groupId } })).toBe(0);
  });

  it('sends no meeting reminder for a closed group, and still sends it for a running one', async () => {
    const token = await developerToken();
    const closed = await startedGroup(3);
    const running = await startedGroup(3);
    const soon = new Date(Date.now() + 3_600_000);
    for (const { groupId } of [closed, running]) {
      await prisma().meeting.create({
        data: { groupId, scheduledAt: soon, place: 'Chez Carine', status: 'SCHEDULED' },
      });
    }
    expect((await developerCall(token, 'post', closePath(closed.groupId))).status).toBe(200);
    const reminders = await meetingReminders(new Date());
    const groups = new Set(reminders.map((r) => r.groupId));
    expect(groups.has(running.groupId)).toBe(true);
    expect(groups.has(closed.groupId)).toBe(false);
  });
});

describe('closing a group with a secret vote open', () => {
  it('records that it expired and no totals at all in the hash chain', async () => {
    const token = await developerToken();
    const { groupId, admin, members } = await startedGroup(3);
    const now = new Date();
    const proposal = await prisma().proposal.create({
      data: {
        groupId,
        type: 'MEMBER_REMOVE',
        payload: { membershipId: members[2]!.membershipId },
        proposerMembershipId: admin.membershipId,
        subjectMembershipId: members[2]!.membershipId,
        secret: true,
        thresholdKind: 'MAJORITY',
        eligibleMembershipIds: [admin.membershipId, members[0]!.membershipId],
        yesCount: 2,
        noCount: 1,
        opensAt: now,
        closesAt: new Date(now.getTime() + 72 * 3_600_000),
      },
    });
    expect((await developerCall(token, 'post', closePath(groupId))).status).toBe(200);
    const events = await prisma().ledgerTransaction.findMany({
      where: { groupId, type: 'EVENT', refId: proposal.id },
    });
    expect(events).toHaveLength(1);
    const metadata = events[0]!.metadata as Record<string, unknown>;
    expect(metadata).toMatchObject({ event: 'VOTE_CLOSED', status: 'EXPIRED', eligible: 2 });
    // Neither a false zero (it would claim no ballot exists) nor the real totals (they would leak).
    expect(metadata).not.toHaveProperty('yes');
    expect(metadata).not.toHaveProperty('no');
    expect(JSON.stringify(events[0])).not.toMatch(/"yes"|"no"/);
  });
});

describe('a developer’s audit entries', () => {
  it('never carry a member, even when the request or the call names one', async () => {
    const member = await signUp();
    await runWithContext({ requestId: randomUUID(), userId: member.id }, async () => {
      await audit({
        action: 'developer.test.entry',
        actorUserId: member.id,
        details: { developer: DEV_USERNAME },
      });
      await audit({ action: 'member.test.entry', actorUserId: member.id });
    });
    const dev = await prisma().auditLog.findFirstOrThrow({
      where: { action: 'developer.test.entry' },
      orderBy: { createdAt: 'desc' },
    });
    expect(dev.actorUserId).toBeNull();
    const other = await prisma().auditLog.findFirstOrThrow({
      where: { action: 'member.test.entry' },
      orderBy: { createdAt: 'desc' },
    });
    expect(other.actorUserId).toBe(member.id);
  });

  it('records the configured developer name on login, not the typed one', async () => {
    await developerToken();
    const entry = await prisma().auditLog.findFirstOrThrow({
      where: { action: 'developer.login.succeeded' },
      orderBy: { createdAt: 'desc' },
    });
    expect(entry.details).toMatchObject({ developer: DEV_USERNAME });
    expect(entry.actorUserId).toBeNull();
  });
});
