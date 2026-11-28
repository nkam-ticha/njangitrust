// The reliability score endpoint (spec R14, FSD STA-02): the share of the last due items paid on
// time, with the counts, computed by the rules package; a member with fewer than 3 due items has
// no percentage; only people who were members of the group may read it.
import { beforeAll, describe, expect, it } from 'vitest';
import { reliabilityResponseSchema } from '@njangi/shared/contracts/me';
import { getPrisma } from '../../lib/prisma';
import { chatWorld, type ChatWorld, type Member } from '../../../test/helpers/chat-world';
import { stageApi } from '../../../test/helpers/stage-client';

let w: ChatWorld;
let cycleId: string;

const DAY = 86_400_000;

/** One contribution per round for a member, due in the past (month 1 = January 2026). */
async function rounds(member: Member, items: { month: number; paid: boolean; onTime?: boolean }[]) {
  const prisma = getPrisma();
  for (const item of items) {
    const dueAt = new Date(Date.UTC(2026, item.month - 1, 20, 17));
    const round =
      (await prisma.round.findUnique({
        where: { cycleId_number: { cycleId, number: item.month } },
      })) ??
      (await prisma.round.create({
        data: {
          groupId: w.groupId,
          cycleId,
          number: item.month,
          dueAt,
          payoutAt: new Date(dueAt.getTime() + 3_600_000),
          status: 'CLOSED',
          ruleSetVersion: 1,
        },
      }));
    const onTime = item.onTime ?? true;
    await prisma.obligation.create({
      data: {
        groupId: w.groupId,
        membershipId: member.membershipId,
        kind: 'CONTRIBUTION',
        roundId: round.id,
        amount: 10_000,
        dueAt,
        status: item.paid ? 'PAID' : 'DUE',
        paidAt: item.paid ? new Date(dueAt.getTime() + (onTime ? -DAY : DAY)) : null,
        onTime: item.paid ? onTime : null,
      },
    });
  }
}

const reliabilityUrl = (groupId: string) => `/v1/groups/${groupId}/me/reliability`;

beforeAll(async () => {
  w = await chatWorld();
  const group = await getPrisma().group.findUniqueOrThrow({ where: { id: w.groupId } });
  cycleId = group.currentCycleId!;
  // Bea: four rounds, three on time and one late.
  await rounds(w.bea, [
    { month: 1, paid: true, onTime: true },
    { month: 2, paid: true, onTime: true },
    { month: 3, paid: true, onTime: false },
    { month: 4, paid: true, onTime: true },
  ]);
  // Carl: two rounds only, so "new member".
  await rounds(w.carl, [
    { month: 1, paid: true, onTime: true },
    { month: 2, paid: true, onTime: true },
  ]);
  // Dina: three rounds, none paid.
  await rounds(w.dina, [
    { month: 1, paid: false },
    { month: 2, paid: false },
    { month: 3, paid: false },
  ]);
});

describe('GET /v1/groups/:groupId/me/reliability', () => {
  it('counts the on-time items of the last due items and rounds the percentage', async () => {
    const res = await stageApi(w.bea).get(reliabilityUrl(w.groupId));
    expect(res.status).toBe(200);
    const { reliability } = reliabilityResponseSchema.parse(res.body);
    expect(reliability).toMatchObject({ onTime: 3, total: 4, percent: 75 });
    expect(reliability.window).toBeGreaterThanOrEqual(3);
  });

  it('gives a member who paid nothing on time 0 percent, not "new member"', async () => {
    const res = await stageApi(w.dina).get(reliabilityUrl(w.groupId));
    expect(res.body.reliability).toMatchObject({ onTime: 0, total: 3, percent: 0 });
  });

  it('has no percentage with fewer than 3 due items (R14.2)', async () => {
    const res = await stageApi(w.carl).get(reliabilityUrl(w.groupId));
    expect(res.status).toBe(200);
    expect(res.body.reliability.percent).toBeNull();
    expect(res.body.reliability.total).toBe(2);
  });

  it('has no percentage and no count for a member who has not been due yet', async () => {
    const res = await stageApi(w.admin).get(reliabilityUrl(w.groupId));
    expect(res.body.reliability).toMatchObject({ onTime: 0, total: 0, percent: null });
  });

  it('answers a member who left, so the statements of past groups stay readable (R12.4)', async () => {
    expect((await stageApi(w.leaver).get(reliabilityUrl(w.groupId))).status).toBe(200);
  });

  it('takes no query: a request naming another member is refused, never answered for them', async () => {
    const url = `${reliabilityUrl(w.groupId)}?membershipId=${w.dina.membershipId}`;
    const res = await stageApi(w.bea).get(url);
    expect(res.status).toBe(400);
    expect(res.body.reliability).toBeUndefined();
  });

  it('refuses a stranger as if the group did not exist, and an anonymous caller', async () => {
    const stranger = await stageApi(w.stranger).get(reliabilityUrl(w.groupId));
    expect(stranger.status).toBe(404);
    expect(stranger.body.code).toBe('GROUP_NOT_FOUND');
    expect((await stageApi(null).get(reliabilityUrl(w.groupId))).status).toBe(401);
  });
});
