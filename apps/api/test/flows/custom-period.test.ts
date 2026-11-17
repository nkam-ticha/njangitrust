// A group that runs on the smallest settings (D23): contributions of 25 FCFA and a custom round
// period typed in minutes, down to one minute. Rounds are dated by the real services at cycle start.
import { describe, expect, it } from 'vitest';
import { getPrisma } from '../../src/lib/prisma';
import { api } from '../helpers/client';
import { addMember, confirm, createGroup, signUp } from '../helpers/factories';

const MINUTE = 60_000;

describe('25 FCFA contributions and a one-minute period (D23)', () => {
  it('creates, dates and opens the rounds a minute apart', async () => {
    const admin = await signUp();
    const firstPayoutAt = new Date(Date.now() + 10 * MINUTE);
    const created = await createGroup(admin, {
      firstPayoutAt: firstPayoutAt.toISOString(),
      rules: {
        contributionAmount: 25,
        solidarityContribution: 0,
        frequency: 'CUSTOM',
        customPeriodMinutes: 1,
      },
    });
    const rules = await api(admin).get(`/v1/groups/${created.groupId}/rules`);
    expect(rules.body.ruleSet.params).toMatchObject({
      contributionAmount: 25,
      frequency: 'CUSTOM',
      customPeriodMinutes: 1,
    });

    await addMember(admin, created.groupId);
    await addMember(admin, created.groupId);
    const card = await api(admin).post(`/v1/groups/${created.groupId}/cycles/start`);
    expect((await confirm(admin, card.body.action.id)).status).toBe(200);

    const group = await getPrisma().group.findUniqueOrThrow({ where: { id: created.groupId } });
    const rounds = await getPrisma().round.findMany({
      where: { cycleId: group.currentCycleId! },
      orderBy: { number: 'asc' },
    });
    expect(rounds).toHaveLength(3);
    rounds.forEach((round, index) => {
      expect(round.payoutAt.getTime()).toBe(firstPayoutAt.getTime() + index * MINUTE);
      // Half a period before the payout: after the previous payout, before its own.
      expect(round.dueAt.getTime()).toBe(round.payoutAt.getTime() - MINUTE / 2);
    });
    const obligations = await getPrisma().obligation.findMany({
      where: { roundId: rounds[0]!.id, kind: 'CONTRIBUTION' },
    });
    expect(obligations).toHaveLength(3);
    expect(obligations.every((o) => o.amount === 25)).toBe(true);
  });

  it('refuses a contribution under 25 FCFA and a period under one minute', async () => {
    const admin = await signUp();
    const low = await api(admin).post('/v1/groups', {
      name: 'Njangi',
      firstPayoutAt: new Date(Date.now() + 10 * MINUTE).toISOString(),
      rules: { contributionAmount: 24 },
    });
    expect(low.body.code).toBe('RULE_VALUE_OUT_OF_RANGE');
    expect(low.body.details).toMatchObject({ parameter: 'contributionAmount', min: 25 });
    const short = await api(admin).post('/v1/groups', {
      name: 'Njangi',
      firstPayoutAt: new Date(Date.now() + 10 * MINUTE).toISOString(),
      rules: { frequency: 'CUSTOM', customPeriodMinutes: 0 },
    });
    expect(short.body.code).toBe('RULE_VALUE_OUT_OF_RANGE');
    expect(short.body.details).toMatchObject({ parameter: 'customPeriodMinutes', min: 1 });
  });

  it('reads a rule set saved before the custom period existed', async () => {
    const admin = await signUp();
    const created = await createGroup(admin);
    const row = await getPrisma().ruleSet.findFirstOrThrow({ where: { groupId: created.groupId } });
    const { customPeriodMinutes: _removed, ...legacy } = row.params as Record<string, unknown>;
    await getPrisma().ruleSet.update({ where: { id: row.id }, data: { params: legacy as never } });
    const rules = await api(admin).get(`/v1/groups/${created.groupId}/rules`);
    expect(rules.status).toBe(200);
    expect(rules.body.ruleSet.params).toMatchObject({
      frequency: 'MONTHLY',
      customPeriodMinutes: 1_440,
    });
  });
});
