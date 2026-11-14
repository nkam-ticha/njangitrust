// R11.1, R11.2, R12, R1.4, FSD GOV-01..04, MEM-02, AC-05, AC-07: rule changes, removal, admin
// change and early exit, end to end.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '../../../lib/prisma';
import { api } from '../../../../test/helpers/client';
import {
  callsTo,
  installFakeMoney,
  uninstallFakeMoney,
  type FakeMoney,
} from '../../../../test/helpers/fake-money-port';
import {
  closeAtDeadline,
  propose,
  proposalOf,
  startedGroup,
  vote,
} from '../../../../test/helpers/governance';

let money: FakeMoney;
beforeAll(() => {
  money = installFakeMoney();
});
afterAll(() => uninstallFakeMoney());

describe('RULE_CHANGE (AC-05, GOV-04, D13.1)', () => {
  it('needs two-thirds of all eligible voters, then applies a new rule set from the next round', async () => {
    const { groupId, admin, members } = await startedGroup(3);
    const id = await propose(members[0]!, groupId, {
      type: 'RULE_CHANGE',
      changes: { lateFine: 1_500 },
      reason: 'Trop de retards',
    });
    const opened = await proposalOf(admin, id);
    expect(opened).toMatchObject({
      requiredYes: 3,
      eligibleCount: 4,
      thresholdKind: 'TWO_THIRDS',
      secret: false,
    });
    expect(opened.title.fr).toMatch(/^Amende de retard\s:\s1\s000\sFCFA → 1\s500\sFCFA$/);

    await vote(members[0]!, id, 'YES');
    await vote(members[1]!, id, 'YES');
    // Two yes out of four eligible: still open (votes cast don't count, eligible voters do).
    expect((await proposalOf(admin, id)).status).toBe('OPEN');
    await vote(members[2]!, id, 'YES');
    const passed = await proposalOf(admin, id);
    expect(passed.status).toBe('PASSED');
    expect(passed.effect.fr).toMatch(/tour 2/);

    const rules = await api(admin).get(`/v1/groups/${groupId}/rules`);
    expect(rules.body.ruleSet).toMatchObject({ version: 2, params: { lateFine: 1_500 } });
    expect(callsTo(money, 'applyRuleSet').filter((c) => c.input.groupId === groupId)).toHaveLength(
      1,
    );
    const events = money.ledger.filter((e) => e.groupId === groupId).map((e) => e.event.event);
    expect(events).toEqual(['RULE_SET_APPLIED', 'VOTE_CLOSED']);
  });

  it('refuses out-of-range values, unchanged values and a second open vote on the same rule (R11.6, R11.7)', async () => {
    const { groupId, members } = await startedGroup(2);
    const card = (body: object) =>
      api(members[0]).post(`/v1/groups/${groupId}/proposals`, { type: 'RULE_CHANGE', ...body });
    expect((await card({ changes: { lateFine: 999_999 } })).body.code).toBe(
      'RULE_VALUE_OUT_OF_RANGE',
    );
    expect((await card({ changes: { lateFine: 1_000 } })).body.code).toBe('RULE_CHANGE_NO_CHANGE');
    expect((await card({ changes: {} })).body.code).toBe('RULE_CHANGE_EMPTY');
    await propose(members[0]!, groupId, { type: 'RULE_CHANGE', changes: { lateFine: 2_000 } });
    expect((await card({ changes: { lateFine: 3_000 } })).body.code).toBe(
      'RULE_CHANGE_ALREADY_OPEN',
    );
  });

  it('refuses free text that carries a phone number (privacy-guard M3)', async () => {
    const { groupId, members } = await startedGroup(2);
    const res = await api(members[0]).post(`/v1/groups/${groupId}/proposals`, {
      type: 'RULE_CHANGE',
      changes: { lateFine: 2_000 },
      reason: 'Appelez-moi au 699 00 11 22',
    });
    expect(res.status).toBe(400);
    expect(res.body.details.issues).toContainEqual({
      path: 'body.reason',
      code: 'TEXT_CONTAINS_PHONE',
    });
  });
});

describe('MEMBER_REMOVE (secret, target excluded, R12.3)', () => {
  it('removes after a secret majority without the target, settles, and ends their access', async () => {
    const { groupId, admin, members } = await startedGroup(3);
    const [a, b, target] = members as [
      (typeof members)[0],
      (typeof members)[0],
      (typeof members)[0],
    ];
    expect(
      (
        await api(a).post(`/v1/groups/${groupId}/proposals`, {
          type: 'MEMBER_REMOVE',
          membershipId: admin.membershipId,
          reason: 'x x',
        })
      ).body.code,
    ).toBe('ADMIN_MUST_CHANGE_FIRST');
    expect(
      (
        await api(a).post(`/v1/groups/${groupId}/proposals`, {
          type: 'MEMBER_REMOVE',
          membershipId: a.membershipId,
          reason: 'x x',
        })
      ).body.code,
    ).toBe('CANNOT_TARGET_SELF');

    const id = await propose(a, groupId, {
      type: 'MEMBER_REMOVE',
      membershipId: target.membershipId,
      reason: 'Absences répétées',
    });
    expect(
      (
        await api(b).post(`/v1/groups/${groupId}/proposals`, {
          type: 'MEMBER_REMOVE',
          membershipId: target.membershipId,
          reason: 'encore',
        })
      ).body.code,
    ).toBe('PROPOSAL_ALREADY_OPEN');
    const open = await proposalOf(target, id);
    expect(open).toMatchObject({
      secret: true,
      eligibleCount: 3,
      requiredYes: 2,
      canVote: false,
      tally: null,
      votes: null,
    });
    expect((await vote(target, id, 'NO')).body.code).toBe('NOT_ELIGIBLE_VOTER');

    await vote(a, id, 'YES');
    await vote(admin, id, 'YES');
    // D20.1: the majority is in, but a secret vote runs its full window; totals come at the end.
    expect(await proposalOf(admin, id)).toMatchObject({
      status: 'OPEN',
      participation: 2,
      tally: null,
    });
    expect(await closeAtDeadline(id)).toBe('PASSED');
    expect(await proposalOf(admin, id)).toMatchObject({
      status: 'PASSED',
      tally: { yes: 2, no: 0 },
    });
    const ended = await getPrisma().membership.findUniqueOrThrow({
      where: { id: target.membershipId },
    });
    expect(ended.status).toBe('REMOVED');
    expect(callsTo(money, 'settleExit').map((c) => c.input)).toContainEqual(
      expect.objectContaining({ membershipId: target.membershipId, reason: 'REMOVED' }),
    );
    expect((await api(target).get(`/v1/groups/${groupId}/overview`)).body.code).toBe(
      'MEMBERSHIP_ENDED',
    );
    const left = money.ledger.find((e) => e.event.event === 'MEMBER_LEFT' && e.groupId === groupId);
    expect(left?.event).toMatchObject({ membershipId: target.membershipId, reason: 'REMOVED' });
    // L-6, R12.4: the removed member is told, without any vote detail.
    const told = await getPrisma().notification.findMany({
      where: { userId: target.id, groupId, titleEn: 'You are no longer in the group' },
    });
    expect(told).toHaveLength(1);
    expect(told[0]!.bodyEn).toMatch(/voted to remove you/);
  });
});

describe('ADMIN_CHANGE (secret, R1.4)', () => {
  it('moves the admin role after a secret majority, keeping exactly one admin', async () => {
    const { groupId, admin, members } = await startedGroup(2);
    const next = members[0]!;
    expect(
      (
        await api(next).post(`/v1/groups/${groupId}/proposals`, {
          type: 'ADMIN_CHANGE',
          membershipId: admin.membershipId,
        })
      ).body.code,
    ).toBe('ALREADY_ADMIN');
    const id = await propose(next, groupId, {
      type: 'ADMIN_CHANGE',
      membershipId: next.membershipId,
    });
    expect((await proposalOf(admin, id)).secret).toBe(true);
    await vote(next, id, 'YES');
    await vote(members[1]!, id, 'YES');
    expect((await proposalOf(admin, id)).status).toBe('OPEN');
    expect(await closeAtDeadline(id)).toBe('PASSED');
    const roles = await getPrisma().membership.findMany({
      where: { groupId, role: 'ADMIN' },
      select: { id: true },
    });
    expect(roles).toEqual([{ id: next.membershipId }]);
    expect((await api(admin).get(`/v1/groups/${groupId}/invites`)).body.code).toBe('ADMIN_ONLY');
    expect((await api(next).get(`/v1/groups/${groupId}/invites`)).status).toBe(200);
  });
});

describe('EARLY_EXIT (requester excluded, R12.3, D15)', () => {
  it('lets the leaver ask, excludes them from the vote, then settles their exit', async () => {
    const { groupId, admin, members } = await startedGroup(3);
    const leaver = members[0]!;
    expect(
      (
        await api(admin).post(`/v1/groups/${groupId}/proposals`, {
          type: 'EARLY_EXIT',
          reason: 'Je pars',
        })
      ).body.code,
    ).toBe('ADMIN_MUST_CHANGE_FIRST');
    const id = await propose(leaver, groupId, {
      type: 'EARLY_EXIT',
      reason: 'Je déménage à Garoua',
    });
    expect(await proposalOf(admin, id)).toMatchObject({
      eligibleCount: 3,
      requiredYes: 2,
      secret: false,
    });
    await vote(admin, id, 'YES');
    await vote(members[1]!, id, 'YES');
    expect(
      (await getPrisma().membership.findUniqueOrThrow({ where: { id: leaver.membershipId } }))
        .status,
    ).toBe('LEFT');
    expect(callsTo(money, 'settleExit').map((c) => c.input)).toContainEqual(
      expect.objectContaining({ membershipId: leaver.membershipId, reason: 'EARLY_EXIT' }),
    );
  });
});
