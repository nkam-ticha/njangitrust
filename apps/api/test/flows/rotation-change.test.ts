// A voted rotation change on the real cycle services (R2.4, R11.1): the two members swap their
// future rounds, rounds already opened keep their beneficiary, and the change is in the ledger.
import { checkLedger, type LedgerTransaction } from '@njangi/rules';
import { beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '../../src/lib/prisma';
import { api, type TestUser } from '../helpers/client';
import { addMember, confirm, createGroup, signUp } from '../helpers/factories';
import { proposalOf, propose, vote } from '../helpers/governance';

type Member = TestUser & { membershipId: string };

let groupId: string;
let everyone: Member[];

const roundsOf = () =>
  getPrisma().round.findMany({ where: { groupId }, orderBy: { number: 'asc' } });

beforeAll(async () => {
  const user = await signUp();
  const created = await createGroup(user);
  groupId = created.groupId;
  const admin = { ...user, membershipId: created.adminMembershipId };
  everyone = [admin];
  for (let i = 0; i < 3; i += 1) everyone.push(await addMember(admin, groupId));
  const card = await api(admin).post(`/v1/groups/${groupId}/cycles/start`);
  expect((await confirm(admin, card.body.action.id)).status).toBe(200);
});

describe('ROTATION_CHANGE on a started cycle', () => {
  it('refuses a swap with the round in progress, then swaps two future rounds once voted', async () => {
    const admin = everyone[0]!;
    const before = await roundsOf();
    expect(before).toHaveLength(4);
    const who = (number: number) => before[number - 1]!.beneficiaryMembershipId!;
    const member = (id: string) => everyone.find((m) => m.membershipId === id)!;

    // Round 1 is open: its beneficiary cannot be moved.
    const served = await api(admin).post(`/v1/groups/${groupId}/proposals`, {
      type: 'ROTATION_CHANGE',
      swap: [who(1), who(3)],
    });
    expect(served.status).toBeGreaterThanOrEqual(400);

    const id = await propose(admin, groupId, { type: 'ROTATION_CHANGE', swap: [who(3), who(4)] });
    // Both moved members must say yes, with a majority of the group.
    await vote(member(who(3)), id, 'YES');
    expect((await proposalOf(admin, id)).status).toBe('OPEN');
    await vote(member(who(4)), id, 'YES');
    await vote(member(who(1)), id, 'YES');
    expect((await proposalOf(admin, id)).status).toBe('PASSED');

    const after = await roundsOf();
    expect(after.map((r) => r.beneficiaryMembershipId)).toEqual([who(1), who(2), who(4), who(3)]);
    const cycle = await getPrisma().cycle.findFirstOrThrow({ where: { groupId } });
    expect(cycle.rotation).toEqual([who(1), who(2), who(4), who(3)]);
    // Round 1 keeps its obligations and creditor.
    const contributions = await getPrisma().obligation.findMany({
      where: { roundId: before[0]!.id, kind: 'CONTRIBUTION' },
    });
    expect(contributions.every((o) => o.creditorMembershipId === who(1))).toBe(true);

    const rows = await getPrisma().ledgerTransaction.findMany({
      where: { groupId },
      include: { postings: true },
      orderBy: { seq: 'asc' },
    });
    const ledger: LedgerTransaction[] = rows.map((row) => ({
      id: row.id,
      groupId: row.groupId,
      seq: row.seq,
      type: row.type,
      occurredAt: row.occurredAt.toISOString(),
      roundId: row.roundId,
      membershipId: row.membershipId,
      refType: row.refType,
      refId: row.refId,
      descriptionFr: row.descriptionFr,
      descriptionEn: row.descriptionEn,
      metadata: row.metadata as LedgerTransaction['metadata'],
      postings: row.postings.map((p) => ({ account: p.account, amount: p.amount })),
      prevHash: row.prevHash,
      hash: row.hash,
    }));
    expect(ledger.some((t) => t.metadata.event === 'ROTATION_CHANGED')).toBe(true);
    expect(checkLedger(groupId, ledger)).toEqual([]);
  });
});
