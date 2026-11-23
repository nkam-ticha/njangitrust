// Privacy-guard H1, M1, M-A and owner decision D20.1 (R11.5, FSD GOV-03, AC-07), refined by D32: a
// secret vote closes the moment its result is certain (nobody left could change it), and shows only
// participation until then. A vote that stays undecided runs to `closesAt`, where a system job
// publishes result and totals at that exact time, so no time, id or record can be matched to a
// voter.
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
import { closeDueProposals, settleProposal } from './proposals.tally';

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

describe('a secret proposal closes as soon as its result is certain (D32)', () => {
  it('passes right after the deciding vote, before closesAt, without waiting for the last member', async () => {
    const { admin, carine, paul, groupId, proposalId } = await secretVoteGroup();
    events = recordRealtimeEvents();
    await voteYes(carine, proposalId);
    expect(await proposalOf(admin, proposalId)).toMatchObject({
      status: 'OPEN',
      participation: 1,
      tally: null,
      closedAt: null,
    });
    await voteYes(paul, proposalId);

    const row = await getPrisma().proposal.findUniqueOrThrow({ where: { id: proposalId } });
    expect(row.status).toBe('PASSED');
    expect(row.closedAt!.getTime()).toBeLessThan(row.closesAt.getTime());
    expect(await proposalOf(admin, proposalId)).toMatchObject({
      status: 'PASSED',
      participation: 2,
      tally: { yes: 2, no: 0 },
    });
    // The one member left can no longer vote: the result is final.
    expect(
      (await api(admin).post(`/v1/proposals/${proposalId}/votes`, { choice: 'NO' })).status,
    ).toBe(409);
    // Still no ballot, and the ledger result names no member.
    expect(await getPrisma().ballot.count({ where: { proposalId } })).toBe(0);
    const closed = ledger.filter((e) => e.event.event === 'VOTE_CLOSED' && e.refId === proposalId);
    expect(closed).toHaveLength(1);
    expect(closed[0]!.membershipId ?? null).toBeNull();
    const passed = (await results(proposalId)).filter((a) => a.action === 'proposal.passed');
    expect(passed).toHaveLength(1);
    expect(passed[0]).toMatchObject({ actorUserId: null, deviceId: null, requestId: null });
    const groupEvents = events.filter((e) => e.room === `group:${groupId}`);
    // While it was open, the events carried participation only.
    for (const e of groupEvents.filter(
      (g) => g.event === 'proposal.updated' && JSON.stringify(g.payload).includes('"OPEN"'),
    ))
      expect(e.payload).toMatchObject({ tally: null });
    expect(
      await getPrisma().notification.count({
        where: { groupId, deepLink: `/votes/${proposalId}`, titleEn: 'Vote result' },
      }),
    ).toBe(3);
  });

  it('is rejected right after the vote that makes yes unreachable', async () => {
    const { admin, carine, paul, proposalId } = await secretVoteGroup();
    const no = async (user: TestUser) => {
      const card = await api(user).post(`/v1/proposals/${proposalId}/votes`, { choice: 'NO' });
      expect((await confirm(user, card.body.action.id)).status).toBe(200);
    };
    await no(carine);
    expect((await proposalOf(admin, proposalId)).status).toBe('OPEN');
    await no(paul);
    expect(await proposalOf(admin, proposalId)).toMatchObject({
      status: 'REJECTED',
      tally: { yes: 0, no: 2 },
    });
  });

  it('keeps an undecided vote open, showing participation only, and a close job changes nothing', async () => {
    const { admin, carine, groupId, proposalId } = await secretVoteGroup();
    events = recordRealtimeEvents();
    await voteYes(carine, proposalId);
    const row = await getPrisma().proposal.findUniqueOrThrow({ where: { id: proposalId } });
    expect(row).toMatchObject({ status: 'OPEN', closedAt: null });
    expect(await proposalOf(admin, proposalId)).toMatchObject({
      status: 'OPEN',
      participation: 1,
      tally: null,
    });
    for (const e of events.filter(
      (g) => g.room === `group:${groupId}` && g.event === 'proposal.updated',
    ))
      expect(e.payload).toMatchObject({ status: 'OPEN', tally: null });
    expect(await settleProposal(proposalId, new Date(row.closesAt.getTime() - 1))).toBe('OPEN');
  });

  it('publishes an undecided vote at closesAt, at that exact time, as the system', async () => {
    const { admin, carine, groupId, proposalId } = await secretVoteGroup();
    await voteYes(carine, proposalId);
    events = recordRealtimeEvents();
    await closeAtDeadline(proposalId);

    const row = await getPrisma().proposal.findUniqueOrThrow({ where: { id: proposalId } });
    expect(row.status).toBe('EXPIRED');
    // Not the job's run time: the deadline everybody already knew.
    expect(row.closedAt!.getTime()).toBe(row.closesAt.getTime());
    expect(await proposalOf(admin, proposalId)).toMatchObject({
      status: 'EXPIRED',
      participation: 1,
      tally: { yes: 1, no: 0 },
    });
    const closed = ledger.filter((e) => e.event.event === 'VOTE_CLOSED' && e.refId === proposalId);
    expect(closed).toHaveLength(1);
    expect(closed[0]!.occurredAt.getTime()).toBe(row.closesAt.getTime());
    expect(closed[0]!.membershipId ?? null).toBeNull();
    const notices = await getPrisma().notification.findMany({
      where: { groupId, deepLink: `/votes/${proposalId}`, titleEn: 'Vote result' },
    });
    expect(notices).toHaveLength(3);
    expect(new Set(notices.map((n) => n.bodyFr)).size).toBe(1);
  });
});

describe('a secret proposal whose last vote is cast closes at once (D26, D32)', () => {
  it('rejects at once when everyone has voted and the majority is not there', async () => {
    const { admin, carine, paul, proposalId } = await secretVoteGroup();
    const no = async (user: TestUser) => {
      const card = await api(user).post(`/v1/proposals/${proposalId}/votes`, { choice: 'NO' });
      expect((await confirm(user, card.body.action.id)).status).toBe(200);
    };
    await no(carine);
    await voteYes(paul, proposalId);
    expect((await proposalOf(admin, proposalId)).status).toBe('OPEN');
    await no(admin);
    expect(await proposalOf(admin, proposalId)).toMatchObject({
      status: 'REJECTED',
      tally: { yes: 1, no: 2 },
    });
  });

  it('does not need the job queue: the result is there when the last vote returns', async () => {
    const { admin, carine, paul, proposalId } = await secretVoteGroup();
    // A serverless host: queued jobs wait for the next cron tick, which never comes here.
    useJobScheduler(() => Promise.resolve());
    await voteYes(carine, proposalId);
    await voteYes(paul, proposalId);
    expect((await proposalOf(admin, proposalId)).status).toBe('PASSED');
  });
});

describe('a result that is certain but not yet closed (D32)', () => {
  it('refuses a vote that can no longer change anything', async () => {
    const { admin, carine, paul, proposalId } = await secretVoteGroup();
    // Two yes votes are in (the counters), but the closing has not run yet.
    await getPrisma().proposal.update({ where: { id: proposalId }, data: { yesCount: 2 } });
    const late = await api(admin).post(`/v1/proposals/${proposalId}/votes`, { choice: 'NO' });
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('PROPOSAL_CLOSED');
    // The totals that will be published are not changed by a late vote.
    const row = await getPrisma().proposal.findUniqueOrThrow({ where: { id: proposalId } });
    expect([row.yesCount, row.noCount]).toEqual([2, 0]);
    void carine;
    void paul;
  });

  it('is closed by the periodic scan when the request that decided it was cut off', async () => {
    const { admin, groupId, proposalId } = await secretVoteGroup();
    // The scan leaves an undecided vote alone, even though it is open for 72 hours.
    await closeDueProposals(new Date());
    expect((await proposalOf(admin, proposalId)).status).toBe('OPEN');
    // A deciding vote whose closing never ran.
    await getPrisma().proposal.update({ where: { id: proposalId }, data: { yesCount: 2 } });
    expect(await closeDueProposals(new Date())).toBeGreaterThanOrEqual(1);
    expect(await proposalOf(admin, proposalId)).toMatchObject({
      status: 'PASSED',
      tally: { yes: 2, no: 0 },
    });
    expect(
      await getPrisma().notification.count({
        where: { groupId, deepLink: `/votes/${proposalId}`, titleEn: 'Vote result' },
      }),
    ).toBe(3);
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
