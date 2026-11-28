// F3 of the screen walk: a member who paid every round before its deadline must show a full score
// after the cycle (R14, R3.5): `Obligation.onTime` is set by the real payment flow.
import { afterEach, describe, expect, it } from 'vitest';
import { resetTestClock } from '../../src/lib/clock';
import { getPrisma } from '../../src/lib/prisma';
import { closeCycle } from '../../src/modules/cycles';
import { api, type TestUser } from '../helpers/client';
import { playCycle, relogin } from '../helpers/cycle-flows';
import { addMember, confirm, createGroup, signUp } from '../helpers/factories';

type Member = TestUser & { membershipId: string };

afterEach(() => resetTestClock());

describe('reliability after a cycle paid on time', () => {
  it('flags every paid obligation on time and scores 100 for each member', async () => {
    const signedUp = await signUp();
    const created = await createGroup(signedUp);
    const groupId = created.groupId;
    await getPrisma().group.update({
      where: { id: groupId },
      data: { providerAccount: `test-${groupId}` },
    });
    const admin: Member = { ...signedUp, membershipId: created.adminMembershipId };
    const members = [admin];
    for (let i = 0; i < 3; i += 1) members.push(await addMember(admin, groupId));
    const card = await api(admin).post(`/v1/groups/${groupId}/cycles/start`);
    expect((await confirm(admin, card.body.action.id)).status).toBe(200);

    await playCycle(groupId, members);
    const cycle = await getPrisma().cycle.findFirstOrThrow({ where: { groupId } });
    expect(await closeCycle(cycle.id)).toBe(true);

    const paid = await getPrisma().obligation.findMany({
      where: { groupId, kind: { in: ['CONTRIBUTION', 'SOLIDARITY'] } },
      select: { status: true, onTime: true },
    });
    expect(paid.length).toBe(4 * 4 * 2);
    expect(paid.every((o) => o.status === 'PAID' && o.onTime === true)).toBe(true);

    for (const member of members) {
      const res = await api(await relogin(member)).get(`/v1/groups/${groupId}/me/reliability`);
      expect(res.status).toBe(200);
      expect(res.body.reliability).toMatchObject({ onTime: 4, total: 4, percent: 100 });
    }
  }, 90_000);
});
