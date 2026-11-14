// R2.4, R6.4, R7.4, R10, R11.1, R11.3, LED-03, SOL-01: proposals whose effect the money modules
// carry out, plus expiry and reminders.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { advanceTestClock, resetTestClock, setTestClock } from '../../../lib/clock';
import { AfterCommit } from '../../../lib/after-commit';
import { getPrisma } from '../../../lib/prisma';
import { api } from '../../../../test/helpers/client';
import {
  callsTo,
  installFakeMoney,
  uninstallFakeMoney,
  type FakeMoney,
} from '../../../../test/helpers/fake-money-port';
import { propose, proposalOf, startedGroup, vote } from '../../../../test/helpers/governance';
import {
  closeDueProposals,
  openAdminLoanProposal,
  remindDueVoters,
  settleProposal,
} from '../index';

let money: FakeMoney;
beforeAll(() => {
  money = installFakeMoney();
});
afterAll(() => {
  uninstallFakeMoney();
  resetTestClock();
});

describe('ROTATION_CHANGE: majority, and every moved member must approve (R11.1)', () => {
  it('fails when a moved member votes no, even with a majority', async () => {
    const { groupId, admin, members } = await startedGroup(3);
    const [a, b, c] = members as [(typeof members)[0], (typeof members)[0], (typeof members)[0]];
    money.rotations.set(groupId, {
      rotation: [admin.membershipId, a.membershipId, b.membershipId, c.membershipId],
      currentRound: 1,
    });
    expect(
      (
        await api(c).post(`/v1/groups/${groupId}/proposals`, {
          type: 'ROTATION_CHANGE',
          swap: [admin.membershipId, c.membershipId],
        })
      ).body.code,
    ).toBe('ROTATION_ALREADY_SERVED');
    const id = await propose(a, groupId, {
      type: 'ROTATION_CHANGE',
      swap: [b.membershipId, c.membershipId],
    });
    const open = await proposalOf(admin, id);
    expect(open.mustApprove.map((m: { membershipId: string }) => m.membershipId).sort()).toEqual(
      [b.membershipId, c.membershipId].sort(),
    );
    await vote(admin, id, 'YES');
    await vote(a, id, 'YES');
    await vote(c, id, 'YES');
    expect((await proposalOf(admin, id)).status).toBe('OPEN'); // b, who moves, hasn't approved
    await vote(b, id, 'NO');
    expect((await proposalOf(admin, id)).status).toBe('REJECTED');
    expect(
      callsTo(money, 'applyRotationChange').filter((x) => x.input.groupId === groupId),
    ).toHaveLength(0);
  });

  it('applies the swap from the next round once the moved members approve', async () => {
    const { groupId, admin, members } = await startedGroup(3);
    const [a, b, c] = members as [(typeof members)[0], (typeof members)[0], (typeof members)[0]];
    money.rotations.set(groupId, {
      rotation: [admin.membershipId, a.membershipId, b.membershipId, c.membershipId],
      currentRound: 1,
    });
    const id = await propose(a, groupId, {
      type: 'ROTATION_CHANGE',
      swap: [b.membershipId, c.membershipId],
    });
    await vote(b, id, 'YES');
    await vote(c, id, 'YES');
    await vote(a, id, 'YES');
    expect((await proposalOf(admin, id)).status).toBe('PASSED');
    expect(money.rotations.get(groupId)!.rotation).toEqual([
      admin.membershipId,
      a.membershipId,
      c.membershipId,
      b.membershipId,
    ]);
  });
});

describe('FINE_WAIVER and LEDGER_CORRECTION (R6.4, LED-03)', () => {
  it('excludes the fined member and has the money modules cancel the fine', async () => {
    const { groupId, admin, members } = await startedGroup(2);
    const fineId = '7f1e6a2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
    money.fines.set(fineId, {
      groupId,
      membershipId: members[0]!.membershipId,
      amount: 1_000,
      roundNumber: 3,
      waivable: true,
    });
    const id = await propose(members[1]!, groupId, {
      type: 'FINE_WAIVER',
      fineId,
      reason: 'Hospitalisé ce jour-là',
    });
    expect(await proposalOf(admin, id)).toMatchObject({
      eligibleCount: 2,
      subject: { amount: 1_000, roundNumber: 3 },
    });
    await vote(members[1]!, id, 'YES');
    await vote(admin, id, 'YES');
    expect(callsTo(money, 'waiveFine').map((c) => c.input)).toContainEqual(
      expect.objectContaining({ obligationId: fineId }),
    );
  });

  it('corrects the ledger only after two-thirds, through a correcting entry', async () => {
    const { groupId, admin, members } = await startedGroup(2);
    expect(
      (
        await api(admin).post(`/v1/groups/${groupId}/proposals`, {
          type: 'LEDGER_CORRECTION',
          seq: 99,
          correction: 'Montant erroné',
          reason: 'Erreur de saisie',
        })
      ).body.code,
    ).toBe('LEDGER_ENTRY_NOT_CORRECTABLE');
    const id = await propose(admin, groupId, {
      type: 'LEDGER_CORRECTION',
      seq: 4,
      correction: 'Le paiement de Paul compté deux fois',
      reason: 'Doublon',
    });
    expect((await proposalOf(admin, id)).requiredYes).toBe(2);
    await vote(admin, id, 'YES');
    await vote(members[0]!, id, 'YES');
    expect(callsTo(money, 'correctLedger').map((c) => c.input)).toContainEqual(
      expect.objectContaining({ seq: 4 }),
    );
  });
});

describe('solidarity requests (R10, SOL-01)', () => {
  it('opens a 24-hour majority vote within the fund, and pays when it passes', async () => {
    const { groupId, admin, members } = await startedGroup(2);
    const over = await api(members[0]).post(`/v1/groups/${groupId}/solidarity-requests`, {
      recipientMembershipId: members[1]!.membershipId,
      event: 'NAISSANCE',
      amount: 60_000,
    });
    expect(over.body.code).toBe('SOLIDARITY_ABOVE_FUND');
    const card = await api(members[0]).post(`/v1/groups/${groupId}/solidarity-requests`, {
      recipientMembershipId: members[1]!.membershipId,
      event: 'NAISSANCE',
      amount: 20_000,
      note: 'Bébé arrivé',
    });
    expect(card.status).toBe(201);
    const { confirm } = await import('../../../../test/helpers/factories');
    const done = await confirm(members[0]!, card.body.action.id);
    const id = String(done.body.action.result.ref);
    const open = await proposalOf(admin, id);
    expect(new Date(open.closesAt).getTime() - new Date(open.opensAt).getTime()).toBe(
      24 * 3_600_000,
    );
    const list = await api(admin).get(`/v1/groups/${groupId}/solidarity`);
    expect(list.body).toMatchObject({
      fundBalance: 50_000,
      requests: [{ status: 'VOTING', amount: 20_000, note: 'Bébé arrivé' }],
    });
    await vote(admin, id, 'YES');
    await vote(members[0]!, id, 'YES');
    expect((await api(admin).get(`/v1/groups/${groupId}/solidarity`)).body.requests[0].status).toBe(
      'APPROVED',
    );
    expect(callsTo(money, 'paySolidarity').length).toBeGreaterThan(0);

    // D20.2: lock-screen texts stay neutral; the event and the note are only in the app.
    const notices = await getPrisma().notification.findMany({
      where: { groupId, deepLink: `/votes/${id}` },
    });
    expect(notices.length).toBeGreaterThanOrEqual(3);
    for (const n of notices) {
      const text = `${n.titleFr} ${n.bodyFr} ${n.titleEn} ${n.bodyEn}`;
      expect(text).not.toMatch(/naissance|birth|bébé|20\s000/i);
      expect(text).toMatch(/soutien|support/i);
    }
    const opened = notices.find((n) => n.userId === admin.id && n.titleEn !== 'Vote result');
    expect(opened?.bodyFr).toMatch(/^Nouvelle demande de soutien dans /);
  });
});

describe('ADMIN_LOAN (R7.4)', () => {
  it('is opened by the loans module, excludes the admin, and reports a rejection', async () => {
    const { groupId, admin, members } = await startedGroup(2);
    const loanId = '8e2f7b3f-2d3e-4f60-9bac-1d2e3f4a5b6c';
    const effects = new AfterCommit();
    const proposal = await getPrisma().$transaction((tx) =>
      openAdminLoanProposal(
        tx,
        {
          adminUserId: admin.id,
          groupId,
          loanId,
          membershipId: admin.membershipId,
          amount: 30_000,
          months: 2,
        },
        effects,
      ),
    );
    await effects.run();
    expect(proposal.eligibleMembershipIds).not.toContain(admin.membershipId);
    await vote(members[0]!, proposal.id, 'NO');
    await vote(members[1]!, proposal.id, 'NO');
    expect(callsTo(money, 'decideAdminLoan').map((c) => c.input)).toContainEqual(
      expect.objectContaining({ loanId, approved: false }),
    );
    expect(
      (await api(admin).post(`/v1/groups/${groupId}/proposals`, { type: 'ADMIN_LOAN' })).status,
    ).toBe(400);
  });
});

describe('closing and reminders (R11.3, spec 2.9)', () => {
  it('reminds non-voters once, 24 hours before the close, then expires the vote', async () => {
    setTestClock(new Date());
    const { groupId, admin, members } = await startedGroup(3);
    const id = await propose(admin, groupId, { type: 'RULE_CHANGE', changes: { minBid: 1_000 } });
    await vote(admin, id, 'YES');
    advanceTestClock(48 * 3_600_000 + 60_000);
    // The scan covers every group; this group's three non-voters get one reminder each, once.
    await remindDueVoters();
    await remindDueVoters();
    const reminded = await getPrisma().notification.findMany({
      where: { groupId, titleFr: 'Vote bientôt clos' },
    });
    expect(reminded.map((n) => n.userId).sort()).toEqual(members.map((m) => m.id).sort());
    advanceTestClock(24 * 3_600_000);
    expect(await closeDueProposals()).toBeGreaterThanOrEqual(1);
    expect((await getPrisma().proposal.findUniqueOrThrow({ where: { id } })).status).toBe(
      'EXPIRED',
    );
    expect(await settleProposal(id)).toBe('EXPIRED');
    resetTestClock();
  });

  it('refuses proposals the money modules must carry out while they are not available', async () => {
    const { groupId, members } = await startedGroup(2);
    uninstallFakeMoney();
    try {
      const res = await api(members[0]).post(`/v1/groups/${groupId}/proposals`, {
        type: 'EARLY_EXIT',
        reason: 'Je pars',
      });
      expect(res.body.code).toBe('PROPOSAL_TYPE_UNAVAILABLE');
    } finally {
      money = installFakeMoney();
    }
  });
});
