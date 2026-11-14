import { describe, expect, it } from 'vitest';
import { biddingDrawEvent, cycleStartedEvent, rotationRedrawnEvent } from './events';
import { sampleExport } from './export.test-support';
import { genesisHash } from './hash-chain';
import { chainOf, entry, TEST_GROUP } from './ledger.test-support';
import { verifyLedgerExport } from './verify-export';

describe('cross-checking a mid-cycle redraw (M4, D13.1)', () => {
  const members = ['m01', 'm02', 'm03', 'm04', 'm05'];
  /** A bidding cycle, a no-bid draw for round 1, then a redraw from round 2. */
  const build = (
    split: (winner: string) => { served: string[]; eligible: string[] },
    leaver: ((winner: string) => string) | null = null,
  ) => {
    const start = cycleStartedEvent({
      groupId: TEST_GROUP,
      cycleNumber: 1,
      mode: 'BIDDING',
      latestLedgerHash: genesisHash(TEST_GROUP),
      activeMembershipIds: members,
    });
    const e1 = entry('EVENT', [], { metadata: start });
    const drawn = biddingDrawEvent({
      groupId: TEST_GROUP,
      cycleNumber: 1,
      roundNumber: 1,
      roundId: 'c1r1',
      latestLedgerHash: chainOf([e1])[0]!.hash,
      eligibleMembershipIds: members,
    });
    const e2 = entry('EVENT', [], { metadata: drawn });
    const { served, eligible } = split(drawn.beneficiaryMembershipId);
    const before = [e1, e2];
    if (leaver) {
      before.push(
        entry('EVENT', [], {
          metadata: {
            event: 'MEMBER_LEFT',
            membershipId: leaver(drawn.beneficiaryMembershipId),
            reason: 'EARLY_EXIT',
          },
        }),
      );
    }
    const redraw = rotationRedrawnEvent({
      groupId: TEST_GROUP,
      cycleNumber: 1,
      fromRound: 2,
      latestLedgerHash: chainOf(before).at(-1)!.hash,
      notYetServedMembershipIds: eligible,
      servedMembershipIds: served,
    });
    const txs = chainOf([...before, entry('EVENT', [], { metadata: redraw })]);
    return {
      ...sampleExport(),
      transactions: txs,
      head: { seq: txs.length, hash: txs.at(-1)!.hash },
      balances: {},
      cycles: [
        {
          number: 1,
          mode: 'BIDDING' as const,
          drawSeed: null,
          rotation: members,
          startedAt: '2026-11-01T00:00:00.000Z',
          closedAt: null,
        },
      ],
      proposals: [],
    };
  };

  it('accepts a redraw whose served members include every earlier beneficiary', () => {
    const file = build((w) => ({ served: [w], eligible: members.filter((m) => m !== w) }));
    expect(verifyLedgerExport(file).problems).toEqual([]);
  });

  it('refuses a redraw that forgets an earlier beneficiary or adds outsiders', () => {
    const forgot = build(() => ({ served: [], eligible: members }));
    expect(verifyLedgerExport(forgot).problems[0]).toMatchObject({ seq: 3, code: 'DRAW_MISMATCH' });
    const outsider = build((w) => ({
      served: [w],
      eligible: [...members.filter((m) => m !== w), 'm99'],
    }));
    expect(verifyLedgerExport(outsider).problems[0]).toMatchObject({
      seq: 3,
      code: 'DRAW_MISMATCH',
    });
  });

  it('refuses a served list holding someone who was never a beneficiary (M4)', () => {
    const file = build((w) => {
      const other = members.find((m) => m !== w)!;
      return { served: [w, other], eligible: members.filter((m) => m !== w && m !== other) };
    });
    expect(verifyLedgerExport(file).problems[0]).toMatchObject({
      seq: 3,
      code: 'DRAW_MISMATCH',
      detail: expect.stringContaining('beneficiaries of rounds 1 to 1'),
    });
  });

  it('refuses a redraw that drops a member still in the cycle (M4)', () => {
    const file = build((w) => ({ served: [w], eligible: members.filter((m) => m !== w).slice(1) }));
    expect(verifyLedgerExport(file).problems[0]).toMatchObject({ seq: 3, code: 'DRAW_MISMATCH' });
  });

  it('leaves out a member who left before the redraw (M4, R12.3)', () => {
    const leaver = (w: string) => members.find((m) => m !== w)!;
    const ok = build(
      (w) => ({ served: [w], eligible: members.filter((m) => m !== w && m !== leaver(w)) }),
      leaver,
    );
    expect(verifyLedgerExport(ok).problems).toEqual([]);
    const stale = build((w) => ({ served: [w], eligible: members.filter((m) => m !== w) }), leaver);
    expect(verifyLedgerExport(stale).problems[0]).toMatchObject({ seq: 4, code: 'DRAW_MISMATCH' });
  });
});
