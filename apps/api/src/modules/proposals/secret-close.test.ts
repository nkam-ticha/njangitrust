// Privacy-guard H1, M1, M-A and owner decision D20.1 (R11.5, FSD GOV-03, AC-07): a secret vote
// never closes its proposal. The vote runs its full window; result and totals appear together at
// `closesAt`, written by a system job whose time, ids and records cannot be matched to any voter.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { settleBackground, useJobScheduler } from '../../jobs/dispatch';
import { jobOptions } from '../../jobs/queues';
import { getJobDefinition } from '../../jobs/registry';
import { hashPhone } from '../../lib/crypto';
import { getPrisma } from '../../lib/prisma';
import { recordRealtimeEvents, stopRecording, type RecordedEvent } from '../../realtime/emitter';
import { testApp } from '../../../test/helpers/app';
import { api, type TestUser } from '../../../test/helpers/client';
import {
  addMember,
  confirm,
  createGroup,
  markFirstCycleStarted,
  signUp,
  signupBody,
} from '../../../test/helpers/factories';
import { closeAtDeadline, propose, proposalOf } from '../../../test/helpers/governance';
import { registerGovernancePorts, type LedgerEventInput } from './governance-ports';
import { resetGovernancePortsForTests } from './governance-ports';
import { settleProposal } from './proposals.tally';

const HOUR = 3_600_000;
const ledger: LedgerEventInput[] = [];
let events: RecordedEvent[] = [];

beforeAll(() => {
  // The app registers the real ledger port when it is created: create it first.
  testApp();
  registerGovernancePorts({
    ledgerEvents: { appendEvent: (_tx, e) => Promise.resolve(void ledger.push(e)) },
  });
});
afterAll(() => resetGovernancePortsForTests());
afterEach(() => {
  stopRecording(events);
  useJobScheduler(null);
});

async function secretVoteGroup() {
  const admin = await signUp();
  const { groupId, adminMembershipId } = await createGroup(admin);
  const carine = await addMember(admin, groupId);
  const paul = await addMember(admin, groupId);
  await markFirstCycleStarted(groupId);
  const now = new Date();
  const proposal = await getPrisma().proposal.create({
    data: {
      groupId,
      type: 'MEMBER_ADD',
      payload: { inviteeName: 'Ivo Fon', phoneHash: hashPhone(signupBody().phone) },
      proposerMembershipId: adminMembershipId,
      secret: true,
      thresholdKind: 'MAJORITY',
      eligibleMembershipIds: [adminMembershipId, carine.membershipId, paul.membershipId],
      opensAt: now,
      closesAt: new Date(now.getTime() + 72 * HOUR),
    },
  });
  return {
    admin: { ...admin, membershipId: adminMembershipId },
    carine,
    paul,
    groupId,
    proposalId: proposal.id,
  };
}

async function voteYes(user: TestUser, proposalId: string) {
  const card = await api(user).post(`/v1/proposals/${proposalId}/votes`, { choice: 'YES' });
  const done = await confirm(user, card.body.action.id);
  expect(done.status).toBe(200);
  return card.body.action.id as string;
}

const results = (proposalId: string) =>
  getPrisma().auditLog.findMany({ where: { target: `Proposal:${proposalId}` } });
const atHour = (d: Date | null) => d === null || d.getTime() % HOUR === 0;

describe('a secret proposal runs its full window (D20.1, M-A)', () => {
  it('stays open when the deciding votes are in, showing participation only', async () => {
    const { admin, carine, paul, groupId, proposalId } = await secretVoteGroup();
    events = recordRealtimeEvents();
    await voteYes(carine, proposalId);
    await voteYes(paul, proposalId);

    const row = await getPrisma().proposal.findUniqueOrThrow({ where: { id: proposalId } });
    expect(row).toMatchObject({ status: 'OPEN', closedAt: null });
    expect(await proposalOf(admin, proposalId)).toMatchObject({
      status: 'OPEN',
      participation: 2,
      tally: null,
      closedAt: null,
    });
    expect(ledger.filter((e) => e.refId === proposalId)).toEqual([]);
    expect((await results(proposalId)).map((a) => a.action)).not.toContain('proposal.passed');
    const groupEvents = events.filter((e) => e.room === `group:${groupId}`);
    for (const e of groupEvents.filter((g) => g.event === 'proposal.updated'))
      expect(e.payload).toMatchObject({ status: 'OPEN', tally: null });
    const notices = await getPrisma().notification.count({
      where: { groupId, deepLink: `/votes/${proposalId}`, titleEn: 'Vote result' },
    });
    expect(notices).toBe(0);

    // A close job that runs early changes nothing.
    expect(await settleProposal(proposalId, new Date(row.closesAt.getTime() - 1))).toBe('OPEN');
  });

  it('publishes result and totals together at closesAt, at that exact time, as the system', async () => {
    const { admin, carine, paul, groupId, proposalId } = await secretVoteGroup();
    await voteYes(carine, proposalId);
    await voteYes(paul, proposalId);
    events = recordRealtimeEvents();
    await closeAtDeadline(proposalId);

    const row = await getPrisma().proposal.findUniqueOrThrow({ where: { id: proposalId } });
    expect(row.status).toBe('PASSED');
    // Not the job's run time: the deadline everybody already knew.
    expect(row.closedAt!.getTime()).toBe(row.closesAt.getTime());
    expect(row.appliedAt!.getTime()).toBe(row.closesAt.getTime());
    expect(await proposalOf(admin, proposalId)).toMatchObject({
      status: 'PASSED',
      participation: 2,
      tally: { yes: 2, no: 0 },
    });

    const closed = ledger.filter((e) => e.event.event === 'VOTE_CLOSED' && e.refId === proposalId);
    expect(closed).toHaveLength(1);
    expect(closed[0]!.occurredAt.getTime()).toBe(row.closesAt.getTime());
    expect(closed[0]!.membershipId ?? null).toBeNull();

    const passed = (await results(proposalId)).filter((a) => a.action === 'proposal.passed');
    expect(passed).toHaveLength(1);
    expect(passed[0]).toMatchObject({ actorUserId: null, deviceId: null, requestId: null });

    const notices = await getPrisma().notification.findMany({
      where: { groupId, deepLink: `/votes/${proposalId}`, titleEn: 'Vote result' },
    });
    expect(notices).toHaveLength(3);
    expect(new Set(notices.map((n) => n.bodyFr)).size).toBe(1);
    expect(
      events.some(
        (e) =>
          e.room === `group:${groupId}` &&
          e.event === 'proposal.updated' &&
          JSON.stringify(e.payload).includes('"PASSED"'),
      ),
    ).toBe(true);
  });
});

describe('finished secret votes keep no per-voter time, reference or proposal (H1, M1)', () => {
  it('truncates every action time to the hour and drops the receipt and proposal ids', async () => {
    const { carine, paul, proposalId } = await secretVoteGroup();
    const actionIds = [await voteYes(carine, proposalId), await voteYes(paul, proposalId)];
    const actions = await getPrisma().pendingAction.findMany({ where: { id: { in: actionIds } } });
    expect(actions).toHaveLength(2);
    for (const a of actions) {
      expect(a.status).toBe('DONE');
      expect(a.resultRef).toBeNull();
      expect(a.resultSummary).toBeNull();
      expect(JSON.stringify(a.args)).not.toContain(proposalId);
      expect(JSON.stringify(a)).not.toMatch(/YES|oui|yes|sealed/i);
      for (const t of [a.createdAt, a.expiresAt, a.confirmedAt, a.completedAt])
        expect(atHour(t)).toBe(true);
    }
    for (const r of await getPrisma().voteReceipt.findMany({ where: { proposalId } })) {
      expect(atHour(r.votedAt)).toBe(true);
      expect(r.createdAt.getTime()).toBe(r.votedAt.getTime());
    }
  });

  it('schedules nothing per vote: one close job named after the proposal, returning nothing', async () => {
    const { carine, paul, groupId } = await secretVoteGroup();
    const scheduled: { name: string; jobId: string; data: unknown; at: Date }[] = [];
    useJobScheduler((name, data, at, jobId) => {
      scheduled.push({ name, data, at, jobId });
      return Promise.resolve();
    });
    const proposalId = await propose(carine, groupId, {
      type: 'ADMIN_CHANGE',
      membershipId: carine.membershipId,
    });
    const closesAt = new Date((await proposalOf(carine, proposalId)).closesAt as string);
    expect(scheduled.filter((j) => j.name === 'votes.close')).toEqual([
      { name: 'votes.close', jobId: `close-${proposalId}`, data: { proposalId }, at: closesAt },
    ]);

    scheduled.length = 0;
    await voteYes(carine, proposalId);
    await voteYes(paul, proposalId);
    await settleBackground();
    expect(scheduled.filter((j) => j.name.startsWith('votes.'))).toEqual([]);

    const close = getJobDefinition('votes.close')!;
    expect(await close.process({ data: { proposalId } } as never)).toBeUndefined();
    expect(await close.process({ data: {} } as never)).toBeUndefined();
    expect(jobOptions('votes.close')).toMatchObject({ removeOnComplete: true });
  });
});
