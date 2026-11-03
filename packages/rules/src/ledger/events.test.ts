import { describe, expect, it } from 'vitest';
import { biddingDrawEvent, cycleStartedEvent, drawEventProblem } from './events';
import { genesisHash } from './hash-chain';

const GROUP = '9b2e0c4e-1111-4a5b-8c9d-000000000001';
const IDS = Array.from({ length: 10 }, (_, i) => `m${String(i + 1).padStart(2, '0')}`);

describe('EVENT entries (2.5, R2.3, R8.3, R11.8)', () => {
  it('records the cycle draw with its seed, latest hash and order', () => {
    const event = cycleStartedEvent({
      groupId: GROUP,
      cycleNumber: 1,
      mode: 'FIXED',
      latestLedgerHash: genesisHash(GROUP),
      activeMembershipIds: IDS,
    });
    expect(event).toEqual({
      event: 'CYCLE_STARTED',
      cycleNumber: 1,
      mode: 'FIXED',
      latestHash: genesisHash(GROUP),
      drawSeed: '992d6703dcfd88b4a522aa53f06ed0f81fe22dcb855bfd2a278c86fa4a353400',
      order: ['m03', 'm10', 'm06', 'm01', 'm09', 'm08', 'm02', 'm05', 'm07', 'm04'],
    });
    expect(drawEventProblem(GROUP, event, genesisHash(GROUP))).toBeNull();
  });

  it('records a bidding cycle without a draw', () => {
    expect(
      cycleStartedEvent({
        groupId: GROUP,
        cycleNumber: 2,
        mode: 'BIDDING',
        latestLedgerHash: 'a'.repeat(64),
        activeMembershipIds: IDS,
      }),
    ).toEqual({
      event: 'CYCLE_STARTED',
      cycleNumber: 2,
      mode: 'BIDDING',
      latestHash: 'a'.repeat(64),
      drawSeed: null,
      order: [],
    });
  });

  it('lets anyone detect a draw that does not follow R2.3', () => {
    const event = cycleStartedEvent({
      groupId: GROUP,
      cycleNumber: 1,
      mode: 'FIXED',
      latestLedgerHash: genesisHash(GROUP),
      activeMembershipIds: IDS,
    });
    const swapped = { ...event, order: ['m10', 'm03', ...event.order.slice(2)] };
    expect(drawEventProblem(GROUP, swapped, genesisHash(GROUP))).toMatch(/order/);
    expect(drawEventProblem(GROUP, event, 'b'.repeat(64))).toMatch(/latest hash/);
    expect(
      drawEventProblem(GROUP, { ...event, drawSeed: 'c'.repeat(64) }, genesisHash(GROUP)),
    ).toMatch(/seed/);
  });

  it('records the no-bid draw of a bidding round and checks it (R8.3)', () => {
    const event = biddingDrawEvent({
      groupId: GROUP,
      cycleNumber: 1,
      roundNumber: 5,
      roundId: 'r5',
      latestLedgerHash: genesisHash(GROUP),
      eligibleMembershipIds: ['m09', 'm04', 'm01'],
    });
    expect(event).toEqual({
      event: 'BIDDING_DRAW',
      cycleNumber: 1,
      roundNumber: 5,
      roundId: 'r5',
      latestHash: genesisHash(GROUP),
      drawSeed: '03df01557a30afdf87293f6443420f629add058bcd8d107e30d461effd854d36',
      eligibleMembershipIds: ['m01', 'm04', 'm09'],
      beneficiaryMembershipId: 'm01',
    });
    expect(drawEventProblem(GROUP, event, genesisHash(GROUP))).toBeNull();
    expect(
      drawEventProblem(GROUP, { ...event, beneficiaryMembershipId: 'm09' }, genesisHash(GROUP)),
    ).toMatch(/beneficiary/);
  });
});
