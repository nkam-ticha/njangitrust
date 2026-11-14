import { describe, expect, it } from 'vitest';
import { biddingDrawEvent, cycleStartedEvent } from './events';
import { sampleExport } from './export.test-support';
import { genesisHash } from './hash-chain';
import { chainOf, entry, TEST_GROUP } from './ledger.test-support';
import type { LedgerEntry } from './types';
import { verifyLedgerExport } from './verify-export';

type Maker = (latestHash: string, round1Winner: string) => Record<string, unknown>;

/** A bidding cycle of `members`; round 1 is a no-bid draw among all of them, then `more` events. */
function build(members: string[], more: Maker[]) {
  const start = cycleStartedEvent({
    groupId: TEST_GROUP,
    cycleNumber: 1,
    mode: 'BIDDING',
    latestLedgerHash: genesisHash(TEST_GROUP),
    activeMembershipIds: members,
  });
  const entries: LedgerEntry[] = [entry('EVENT', [], { metadata: start })];
  const round1 = biddingDrawEvent({
    groupId: TEST_GROUP,
    cycleNumber: 1,
    roundNumber: 1,
    roundId: 'c1r1',
    latestLedgerHash: chainOf(entries).at(-1)!.hash,
    eligibleMembershipIds: members,
  });
  entries.push(entry('EVENT', [], { metadata: round1 }));
  for (const make of more) {
    const metadata = make(chainOf(entries).at(-1)!.hash, round1.beneficiaryMembershipId);
    entries.push(entry('EVENT', [], { metadata: metadata as LedgerEntry['metadata'] }));
  }
  const txs = chainOf(entries);
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
}

const members = ['m01', 'm02', 'm03', 'm04', 'm05'];
const others = (w: string) => members.filter((m) => m !== w);
const bids =
  (winner: string, bidders: string[]): Maker =>
  () => ({
    event: 'BIDS_PUBLISHED',
    cycleNumber: 1,
    roundNumber: 2,
    roundId: 'c1r2',
    beneficiaryMembershipId: winner,
    // Bids of 0 (the ledger checks accept them) so these event-only ledgers need no BID_ASSESSED.
    bids: bidders.map((membershipId) => ({ membershipId, amount: 0 })),
  });
const draw =
  (eligible: (w: string) => string[]): Maker =>
  (latestHash, w) =>
    biddingDrawEvent({
      groupId: TEST_GROUP,
      cycleNumber: 1,
      roundNumber: 2,
      roundId: 'c1r2',
      latestLedgerHash: latestHash,
      eligibleMembershipIds: eligible(w),
    });
const problemsOf = (file: ReturnType<typeof build>) => verifyLedgerExport(file).problems;

describe('bidding results against eligibility (M2, R8.2–R8.4)', () => {
  it('accepts a winner and bidders who have not been served yet', () => {
    expect(problemsOf(build(members, [(h, w) => bids(others(w)[0]!, others(w))(h, w)]))).toEqual(
      [],
    );
  });

  it('refuses a winner who was already served', () => {
    expect(
      problemsOf(build(members, [(h, w) => bids(w, [w, others(w)[0]!])(h, w)]))[0],
    ).toMatchObject({
      seq: 3,
      code: 'DRAW_MISMATCH',
      detail: expect.stringContaining('not eligible'),
    });
  });

  it('refuses a bidder who is served, gone or not a member', () => {
    const served = build(members, [(h, w) => bids(others(w)[0]!, [others(w)[0]!, w])(h, w)]);
    expect(problemsOf(served)[0]).toMatchObject({ seq: 3, code: 'DRAW_MISMATCH' });
    const outsider = build(members, [(h, w) => bids(others(w)[0]!, [others(w)[0]!, 'm99'])(h, w)]);
    expect(problemsOf(outsider)[0]).toMatchObject({ seq: 3, code: 'DRAW_MISMATCH' });
    const gone = build(members, [
      (_, w) => ({ event: 'MEMBER_LEFT', membershipId: others(w)[1]!, reason: 'EARLY_EXIT' }),
      (h, w) => bids(others(w)[0]!, [others(w)[0]!, others(w)[1]!])(h, w),
    ]);
    expect(problemsOf(gone)[0]).toMatchObject({ seq: 4, code: 'DRAW_MISMATCH' });
  });

  it("requires a no-bid draw's eligible list to be exactly the members not served and not gone", () => {
    expect(problemsOf(build(members, [draw(others)]))).toEqual([]);
    expect(problemsOf(build(members, [draw(() => members)]))[0]).toMatchObject({
      seq: 3,
      code: 'DRAW_MISMATCH',
    });
    expect(problemsOf(build(members, [draw((w) => others(w).slice(1))]))[0]).toMatchObject({
      seq: 3,
      code: 'DRAW_MISMATCH',
    });
  });

  it('allows a result without bids only for the last eligible member (R8.4)', () => {
    expect(problemsOf(build(members, [(h, w) => bids(others(w)[0]!, [])(h, w)]))[0]).toMatchObject({
      seq: 3,
      code: 'DRAW_MISMATCH',
      detail: expect.stringContaining('last eligible'),
    });
    const two = ['m01', 'm02'];
    const last: Maker = (h, w) =>
      bids(
        two.find((m) => m !== w)!,
        [],
      )(h, w);
    expect(problemsOf(build(two, [last]))).toEqual([]);
  });
});
