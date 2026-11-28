import { describe, expect, it } from 'vitest';
import type { JsonObject } from '../crypto';
import {
  carriedCycleStartedEvent,
  cycleClosedEvent,
  cycleStartedEvent,
  drawEventProblem,
} from './events';
import { sampleExport } from './export.test-support';
import { genesisHash } from './hash-chain';
import { chainOf, entry, TEST_GROUP } from './ledger.test-support';
import { verifyLedgerExport } from './verify-export';

const members = ['m01', 'm02', 'm03', 'm04', 'm05'];

describe('the event of a cycle that keeps its order (D40.3)', () => {
  it('records the kept order with no seed', () => {
    const event = carriedCycleStartedEvent({
      cycleNumber: 2,
      latestLedgerHash: 'h',
      activeMembershipIds: ['m03', 'm01', 'm02'],
      order: ['m02', 'm03', 'm01'],
    });
    expect(event).toEqual({
      event: 'CYCLE_STARTED',
      cycleNumber: 2,
      mode: 'FIXED',
      latestHash: 'h',
      drawSeed: null,
      orderSource: 'CARRIED',
      order: ['m02', 'm03', 'm01'],
      members: ['m01', 'm02', 'm03'],
    });
  });

  it('refuses an order that is not exactly the members', () => {
    expect(() =>
      carriedCycleStartedEvent({
        cycleNumber: 2,
        latestLedgerHash: 'h',
        activeMembershipIds: ['m01', 'm02'],
        order: ['m01'],
      }),
    ).toThrow(RangeError);
  });

  it('is checked without a seed, but never as a draw that is missing its seed', () => {
    const carried = carriedCycleStartedEvent({
      cycleNumber: 2,
      latestLedgerHash: 'h',
      activeMembershipIds: members,
      order: [...members].reverse(),
    });
    expect(drawEventProblem(TEST_GROUP, carried, 'h')).toBeNull();
    expect(drawEventProblem(TEST_GROUP, carried, 'other')).toMatch(/latest hash/);
    expect(drawEventProblem(TEST_GROUP, { ...carried, drawSeed: 'abc' }, 'h')).toMatch(/seed/);
    expect(drawEventProblem(TEST_GROUP, { ...carried, order: ['m01'] }, 'h')).toMatch(/members/);
    // A FIXED draw without the marker still needs its real seed.
    const { orderSource: _marker, ...unmarked } = carried;
    expect(drawEventProblem(TEST_GROUP, unmarked, 'h')).toMatch(/seed/);
  });
});

describe('the CYCLE_CLOSED event', () => {
  it('carries integers only and the reason when nothing was shared', () => {
    const event = cycleClosedEvent({
      cycleNumber: 1,
      mode: 'FIXED',
      facts: {
        fundBalance: 53_753,
        receivables: 16_750,
        availableForLoans: 37_003,
        distributable: 37_003,
        share: 4_111,
        distributed: 36_999,
        remainder: 4,
        eligibleCount: 9,
        reason: null,
      },
    });
    expect(event).toMatchObject({
      event: 'CYCLE_CLOSED',
      cycleNumber: 1,
      share: 4_111,
      reason: null,
    });
  });
});

describe('cycle 2 against the ledger of cycle 1 (verify-ledger, D40.3)', () => {
  const start1 = cycleStartedEvent({
    groupId: TEST_GROUP,
    cycleNumber: 1,
    mode: 'FIXED',
    latestLedgerHash: genesisHash(TEST_GROUP),
    activeMembershipIds: members,
  });

  const closedMeta = {
    event: 'CYCLE_CLOSED',
    cycleNumber: 1,
    mode: 'FIXED',
    fundBalance: 0,
    receivables: 0,
    availableForLoans: 0,
    distributable: 0,
    share: 0,
    distributed: 0,
    remainder: 0,
    eligibleCount: 0,
    reason: 'NOTHING_TO_DISTRIBUTE',
  };

  /** Cycle 1 (draw, optional vote, optional leaver, close), then `make` builds cycle 2's start. */
  const build = (
    make: (previous: string[], hash: string) => JsonObject,
    opts: { leaver?: string; rotationChange?: string[] } = {},
  ) => {
    const entries = [entry('EVENT', [], { metadata: start1 })];
    if (opts.rotationChange) {
      entries.push(
        entry('EVENT', [], {
          metadata: {
            event: 'ROTATION_CHANGED',
            cycleNumber: 1,
            order: opts.rotationChange,
            proposalId: 'p1',
          },
        }),
      );
    }
    if (opts.leaver) {
      entries.push(
        entry('EVENT', [], {
          metadata: { event: 'MEMBER_LEFT', membershipId: opts.leaver, reason: 'CYCLE_END' },
        }),
      );
    }
    entries.push(entry('EVENT', [], { metadata: closedMeta }));
    const before = chainOf(entries);
    const previous = opts.rotationChange ?? start1.order;
    const second = make(previous, before.at(-1)!.hash);
    const txs = chainOf([...entries, entry('EVENT', [], { metadata: second })]);
    return {
      ...sampleExport(),
      transactions: txs,
      head: { seq: txs.length, hash: txs.at(-1)!.hash },
      balances: {},
      proposals: [],
      cycles: [
        {
          number: 1,
          mode: 'FIXED' as const,
          drawSeed: start1.drawSeed,
          rotation: previous,
          startedAt: '2026-11-01T00:00:00.000Z',
          closedAt: '2026-12-01T00:00:00.000Z',
        },
        {
          number: 2,
          mode: 'FIXED' as const,
          drawSeed: (second.drawSeed as string | null) ?? null,
          rotation: second.order as string[],
          startedAt: '2027-01-01T00:00:00.000Z',
          closedAt: null,
        },
      ],
    };
  };

  const carried = (order: string[], hash: string) =>
    carriedCycleStartedEvent({
      cycleNumber: 2,
      latestLedgerHash: hash,
      activeMembershipIds: order,
      order,
    });

  it('accepts the kept order, a leaver dropped and a newcomer at the end', () => {
    const file = build(
      (previous, hash) => carried([...previous.filter((id) => id !== 'm03'), 'm09'], hash),
      { leaver: 'm03' },
    );
    expect(verifyLedgerExport(file).problems).toEqual([]);
  });

  it('keeps the order of cycle 1 after a vote changed it', () => {
    const changed = ['m05', 'm04', 'm03', 'm02', 'm01'];
    const ok = build((previous, hash) => carried(previous, hash), { rotationChange: changed });
    expect(verifyLedgerExport(ok).problems).toEqual([]);
    // Using the drawn order instead of the voted one is a mismatch.
    const wrong = build((_previous, hash) => carried(start1.order, hash), {
      rotationChange: changed,
    });
    expect(verifyLedgerExport(wrong).problems[0]).toMatchObject({ code: 'DRAW_MISMATCH' });
  });

  it('refuses a carried order that moves someone, and one that puts a newcomer first', () => {
    const moved = build((previous, hash) => {
      const order = [...previous];
      [order[0], order[1]] = [order[1]!, order[0]!];
      return carried(order, hash);
    });
    expect(verifyLedgerExport(moved).problems[0]).toMatchObject({ code: 'DRAW_MISMATCH' });
    const newcomerFirst = build((previous, hash) => carried(['m09', ...previous], hash));
    expect(verifyLedgerExport(newcomerFirst).problems[0]).toMatchObject({ code: 'DRAW_MISMATCH' });
  });

  it('puts a member who left and came back last, not in the old slot (M1)', () => {
    // m02 is first in cycle 1's final order, leaves with it (CYCLE_END) and is invited again:
    const first = ['m02', 'm01', 'm03', 'm04', 'm05'];
    // m02 leaves with cycle 1 (CYCLE_END) and is invited again: same membership, a newcomer.
    const back = build(
      (previous, hash) => carried([...previous.filter((id) => id !== 'm02'), 'm02'], hash),
      { leaver: 'm02', rotationChange: first },
    );
    expect(verifyLedgerExport(back).problems).toEqual([]);
    const oldSlot = build((previous, hash) => carried(previous, hash), {
      leaver: 'm02',
      rotationChange: first,
    });
    expect(verifyLedgerExport(oldSlot).problems[0]).toMatchObject({ code: 'DRAW_MISMATCH' });
  });

  it('an older kept-order event with newcomers but no join dates still verifies (L7)', () => {
    const file = build((p, h) => carried([...p, 'm07', 'm09', 'm08'], h));
    expect(verifyLedgerExport(file).problems).toEqual([]);
  });

  it('records when newcomers joined and checks their order: join date, then id (L7)', () => {
    const joinedAt = {
      m09: '2026-12-01T00:00:00.000Z',
      m08: '2026-12-02T00:00:00.000Z',
      m07: '2026-12-01T00:00:00.000Z',
    };
    const withJoin = (order: string[]) => (previous: string[], hash: string) =>
      carriedCycleStartedEvent({
        cycleNumber: 2,
        latestLedgerHash: hash,
        activeMembershipIds: order,
        order,
        newcomerJoinedAt: joinedAt,
      });
    const right = build((p, h) => withJoin([...p, 'm07', 'm09', 'm08'])(p, h));
    expect(verifyLedgerExport(right).problems).toEqual([]);
    const wrong = build((p, h) => withJoin([...p, 'm08', 'm07', 'm09'])(p, h));
    expect(verifyLedgerExport(wrong).problems[0]).toMatchObject({ code: 'DRAW_MISMATCH' });
  });

  it('still accepts a cycle 2 that was drawn (old entries, Q1)', () => {
    const file = build((_previous, hash) =>
      cycleStartedEvent({
        groupId: TEST_GROUP,
        cycleNumber: 2,
        mode: 'FIXED',
        latestLedgerHash: hash,
        activeMembershipIds: members,
      }),
    );
    expect(verifyLedgerExport(file).problems).toEqual([]);
  });

  it('refuses a kept order after a cycle that had no order to keep', () => {
    const bidding = cycleStartedEvent({
      groupId: TEST_GROUP,
      cycleNumber: 1,
      mode: 'BIDDING',
      latestLedgerHash: genesisHash(TEST_GROUP),
      activeMembershipIds: members,
    });
    const e1 = entry('EVENT', [], { metadata: bidding });
    const second = carried(members, chainOf([e1])[0]!.hash);
    const txs = chainOf([e1, entry('EVENT', [], { metadata: second })]);
    const file = {
      ...sampleExport(),
      transactions: txs,
      head: { seq: 2, hash: txs[1]!.hash },
      balances: {},
      proposals: [],
      cycles: [
        {
          number: 1,
          mode: 'BIDDING' as const,
          drawSeed: null,
          rotation: members,
          startedAt: '2026-11-01T00:00:00.000Z',
          closedAt: '2026-12-01T00:00:00.000Z',
        },
        {
          number: 2,
          mode: 'FIXED' as const,
          drawSeed: null,
          rotation: members,
          startedAt: '2027-01-01T00:00:00.000Z',
          closedAt: null,
        },
      ],
    };
    expect(verifyLedgerExport(file).problems[0]).toMatchObject({
      seq: 2,
      code: 'DRAW_MISMATCH',
      detail: expect.stringContaining('no order to keep'),
    });
  });
});
