import { describe, expect, it } from 'vitest';
import {
  cycleCloseCandidates,
  planCycleClose,
  type CycleCloseMember,
  type CycleCloseFacts,
} from './cycle-close';

const member = (id: string, over: Partial<CycleCloseMember> = {}): CycleCloseMember => ({
  membershipId: id,
  status: 'ACTIVE',
  activeFromCycle: 1,
  unpaidObligations: 0,
  receivable: 0,
  ...over,
});

const ids = (n: number) => Array.from({ length: n }, (_, i) => `M${i + 1}`);

const facts = (over: Partial<CycleCloseFacts> = {}): CycleCloseFacts => ({
  cycleNumber: 1,
  distributeFundAtCycleEnd: true,
  generalFund: 53_753,
  receivables: 16_750,
  availableForLoans: 37_003,
  rotation: ids(10),
  members: ids(10).map((id) => member(id)),
  ...over,
});

describe('who can share the general fund at cycle close (R9.3, R9.4, D40)', () => {
  it('lists active and leaving members in rotation order, joiners and leavers left out', () => {
    const members = [
      member('M1'),
      member('M2', { status: 'LEAVING' }),
      member('M3', { status: 'LEFT' }),
      member('M4', { status: 'REMOVED' }),
      member('M5', { status: 'INVITED', activeFromCycle: 2 }),
      member('M6'),
    ];
    const list = cycleCloseCandidates({
      cycleNumber: 1,
      rotation: ['M6', 'M2', 'M1', 'M3'],
      members,
    });
    expect(list.map((c) => c.membershipId)).toEqual(['M6', 'M2', 'M1']);
  });

  it('puts members missing from the rotation after it, by id', () => {
    const list = cycleCloseCandidates({
      cycleNumber: 1,
      rotation: ['M2'],
      members: [member('M3'), member('M1'), member('M2')],
    });
    expect(list.map((c) => c.membershipId)).toEqual(['M2', 'M1', 'M3']);
  });

  it('is active the whole cycle only if active from this cycle or before', () => {
    const list = cycleCloseCandidates({
      cycleNumber: 2,
      rotation: [],
      members: [
        member('A', { activeFromCycle: 1 }),
        member('B', { activeFromCycle: 2 }),
        member('C', { activeFromCycle: 3 }),
        member('D', { activeFromCycle: null }),
      ],
    });
    expect(list.map((c) => [c.membershipId, c.activeWholeCycle])).toEqual([
      ['A', true],
      ['B', true],
      ['C', false],
      // X1: no recorded start counts as cycle 1, like the read side.
      ['D', true],
    ]);
  });

  it('owes the larger of unpaid obligations and the ledger receivable (R7.8, D40.1)', () => {
    const list = cycleCloseCandidates({
      cycleNumber: 1,
      rotation: [],
      members: [
        member('A', { unpaidObligations: 10_000, receivable: 0 }),
        member('B', { unpaidObligations: 0, receivable: 33_500 }),
        member('C', { unpaidObligations: 16_750, receivable: 33_500 }),
        member('D'),
      ],
    });
    expect(list.map((c) => c.outstandingDebt)).toEqual([10_000, 33_500, 33_500, 0]);
  });
});

describe('closing a cycle: the distribution plan (R9.3, E8)', () => {
  it('E8: 37 003 FCFA among 9 members gives 4 111 each, 4 stay in the fund', () => {
    const plan = planCycleClose(
      facts({
        members: ids(10).map((id) =>
          id === 'M10' ? member(id, { receivable: 16_750 }) : member(id),
        ),
      }),
    );
    expect(plan.distribution).toMatchObject({
      ok: true,
      distributable: 37_003,
      share: 4_111,
      distributed: 36_999,
      remainder: 4,
    });
    expect(plan.eligibleCount).toBe(9);
    expect(plan.event).toMatchObject({
      fundBalance: 53_753,
      receivables: 16_750,
      availableForLoans: 37_003,
      distributable: 37_003,
      share: 4_111,
      distributed: 36_999,
      remainder: 4,
      eligibleCount: 9,
      reason: null,
    });
  });

  it('shares in rotation order', () => {
    const plan = planCycleClose(
      facts({ rotation: ['M3', 'M1', 'M2'], members: ids(3).map((i) => member(i)) }),
    );
    expect(plan.distribution.ok && plan.distribution.shares.map((s) => s.membershipId)).toEqual([
      'M3',
      'M1',
      'M2',
    ]);
  });

  it('gives a leaving member a share, and lists who leaves', () => {
    const plan = planCycleClose(
      facts({
        generalFund: 9_000,
        receivables: 0,
        availableForLoans: 9_000,
        rotation: ['M1', 'M2', 'M3'],
        members: [member('M1'), member('M2', { status: 'LEAVING' }), member('M3')],
      }),
    );
    expect(plan.distribution).toMatchObject({ ok: true, share: 3_000 });
    expect(plan.leavingMembershipIds).toEqual(['M2']);
  });

  it('a member with an unpaid contribution gets nothing (D40.1)', () => {
    const plan = planCycleClose(
      facts({
        generalFund: 9_000,
        receivables: 0,
        availableForLoans: 9_000,
        rotation: ['M1', 'M2', 'M3'],
        members: [member('M1'), member('M2', { unpaidObligations: 11_000 }), member('M3')],
      }),
    );
    expect(plan.distribution).toMatchObject({ ok: true, share: 4_500, distributed: 9_000 });
    expect(plan.distribution.ok && plan.distribution.shares.map((s) => s.membershipId)).toEqual([
      'M1',
      'M3',
    ]);
  });

  it('never shares more than is available for loans: reserved money stays', () => {
    const plan = planCycleClose(
      facts({
        generalFund: 100_000,
        receivables: 0,
        availableForLoans: 6_000,
        rotation: ['M1', 'M2', 'M3'],
        members: ids(3).map((i) => member(i)),
      }),
    );
    expect(plan.distribution).toMatchObject({ ok: true, distributable: 6_000, share: 2_000 });
  });

  it('does nothing when sharing is off, recording why and what stays in the fund', () => {
    const plan = planCycleClose(facts({ distributeFundAtCycleEnd: false }));
    expect(plan.distribution).toEqual({ ok: false, code: 'DISTRIBUTION_OFF' });
    expect(plan.event).toMatchObject({
      share: 0,
      distributed: 0,
      remainder: 37_003,
      reason: 'DISTRIBUTION_OFF',
    });
  });

  it('refuses a share of zero and a group with nobody eligible', () => {
    expect(
      planCycleClose(facts({ generalFund: 9, receivables: 0, availableForLoans: 9 })).distribution,
    ).toEqual({ ok: false, code: 'NOTHING_TO_DISTRIBUTE' });
    const nobody = planCycleClose(
      facts({ members: ids(10).map((id) => member(id, { unpaidObligations: 1 })) }),
    );
    expect(nobody.distribution).toEqual({ ok: false, code: 'NO_ELIGIBLE_MEMBER' });
    expect(nobody.event.reason).toBe('NO_ELIGIBLE_MEMBER');
    expect(nobody.event.eligibleCount).toBe(0);
  });

  it('a fund below its debts shares nothing and a negative figure never breaks the plan', () => {
    const plan = planCycleClose(facts({ generalFund: 5_000, receivables: 9_000 }));
    expect(plan.distribution.ok).toBe(false);
    expect(plan.event.distributable).toBe(0);
  });

  it('shares plus remainder always add up to what was distributable', () => {
    for (let fund = 0; fund < 400; fund += 7) {
      for (const n of [1, 2, 3, 7, 10]) {
        const plan = planCycleClose(
          facts({
            generalFund: fund,
            receivables: 0,
            availableForLoans: fund,
            rotation: ids(n),
            members: ids(n).map((i) => member(i)),
          }),
        );
        const e = plan.event;
        expect(e.distributed + e.remainder).toBe(e.distributable);
        expect(Number.isInteger(e.share)).toBe(true);
        if (plan.distribution.ok) {
          expect(plan.distribution.shares.reduce((s, x) => s + x.amount, 0)).toBe(e.distributed);
        }
      }
    }
  });
});
