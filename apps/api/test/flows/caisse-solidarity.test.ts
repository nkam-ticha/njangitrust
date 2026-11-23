// Caisse, Secours: why a solidarity request is refused, and what the member is told (R10.2, D19,
// spec 2.11). The app shows the server's own text, so each refusal must say what to do, in both
// languages. Also the round figures the Tour ring needs.
import { describe, expect, it } from 'vitest';
import { api } from '../helpers/client';
import { createGroup, signUp } from '../helpers/factories';
import { realGroup } from '../helpers/money-flows';

describe('a solidarity request that cannot be made', () => {
  it('before the first cycle says that votes start with the cycle (D19)', async () => {
    const admin = await signUp();
    const created = await createGroup(admin);
    const body = {
      recipientMembershipId: created.adminMembershipId,
      event: 'DEUIL',
      amount: 1_000,
    };
    const refused = await api(admin).post(
      `/v1/groups/${created.groupId}/solidarity-requests`,
      body,
    );
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('PROPOSALS_BEFORE_FIRST_CYCLE');
    expect(refused.body.messageFr).toMatch(/premier cycle/);
    expect(refused.body.messageEn).toMatch(/first cycle/);
    // The fund reads as empty, not as an error, so the screen can explain it.
    const read = await api(admin).get(`/v1/groups/${created.groupId}/solidarity`);
    expect(read.body).toEqual({ fundBalance: 0, requests: [] });
  });

  it('with an empty fund names the balance, and a note with a number is refused as a field', async () => {
    const { groupId, admin } = await realGroup();
    const empty = await api(admin).post(`/v1/groups/${groupId}/solidarity-requests`, {
      recipientMembershipId: admin.membershipId,
      event: 'MALADIE',
      amount: 1_000,
    });
    expect(empty.body.code).toBe('SOLIDARITY_ABOVE_FUND');
    expect(empty.body.messageFr).toMatch(/0/);
    expect(empty.body.messageEn).toMatch(/only has 0/);

    // The sheet checks the note with the same schema first (it is shown to the group, spec 2.11).
    const withNumber = await api(admin).post(`/v1/groups/${groupId}/solidarity-requests`, {
      recipientMembershipId: admin.membershipId,
      event: 'MALADIE',
      amount: 1_000,
      note: 'Appelle le 699123456',
    });
    expect(withNumber.status).toBe(400);
    expect(withNumber.body.code).toBe('VALIDATION_FAILED');
    expect(withNumber.body.details.issues).toContainEqual(
      expect.objectContaining({ path: 'body.note', code: 'TEXT_CONTAINS_PHONE' }),
    );
  });
});

describe('the round read for the Tour ring', () => {
  it('gives the cycle’s number of rounds and what the round expects in all', async () => {
    const { groupId, admin, everyone } = await realGroup();
    const read = await api(admin).get(`/v1/groups/${groupId}/rounds/current`);
    expect(read.status).toBe(200);
    expect(read.body.round).toMatchObject({
      number: 1,
      totalRounds: everyone.length,
      collected: 0,
      contributionCount: everyone.length,
    });
    // Target = the contributions the round expects (each member's amount, summed by the server).
    const each = read.body.round.contributionAmount as number;
    expect(read.body.round.target).toBe(each * everyone.length);
  });
});

describe('the payout breakdown (spec 2.11, 4.4)', () => {
  it('shows what the beneficiary still owes and may withdraw to the beneficiary only', async () => {
    const { groupId, admin, everyone } = await realGroup();
    const round = (await api(admin).get(`/v1/groups/${groupId}/rounds/current`)).body.round;
    const beneficiary = everyone.find((m) => m.membershipId === round.beneficiaryMembershipId)!;
    const other = everyone.find((m) => m.membershipId !== round.beneficiaryMembershipId)!;
    const own = await api(beneficiary).get(`/v1/groups/${groupId}/rounds/1/payout-breakdown`);
    const seen = await api(other).get(`/v1/groups/${groupId}/rounds/1/payout-breakdown`);
    expect(own.status).toBe(200);
    expect(seen.status).toBe(200);
    expect(seen.body.debtsDue).toBe(0);
    expect(seen.body.breakdown.nextWithdrawal).toBeNull();
    // The shared figures are the same for everyone.
    expect(seen.body.breakdown.collected).toBe(own.body.breakdown.collected);
  });
});
