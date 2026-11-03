import { createHash } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { biddingDrawSeed, drawRotation, drawSeed, verifiableShuffle } from './draw';

const GROUP = '9b2e0c4e-1111-4a5b-8c9d-000000000001';
// SHA-256("njangitrust:" + GROUP), the latest ledger hash of a group with no transactions yet.
const GENESIS = '43570e24d2c071a06fe4bb72b80de45bf70d725583a255e202bfb0d6ad13956a';
const IDS = Array.from({ length: 10 }, (_, i) => `m${String(i + 1).padStart(2, '0')}`);

// The R2.3 text transcribed independently with node:crypto, to cross-check the engine.
function referenceShuffle(ids: string[], seed: string): string[] {
  const h = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
  const a = [...ids].sort();
  for (let i = a.length - 1; i >= 1; i--) {
    const j = parseInt(h(`${seed}|${i}`).slice(0, 12), 16) % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

describe('verifiable draw (R2.3)', () => {
  it('computes seed = SHA-256(groupId | cycleNumber | latest ledger hash)', () => {
    expect(drawSeed(GROUP, 1, GENESIS)).toBe(
      '992d6703dcfd88b4a522aa53f06ed0f81fe22dcb855bfd2a278c86fa4a353400',
    );
  });

  it('sorts ascending then shuffles with the seeded Fisher–Yates (golden vector)', () => {
    const anyInputOrder = [...IDS].reverse();
    expect(
      drawRotation({
        groupId: GROUP,
        cycleNumber: 1,
        latestLedgerHash: GENESIS,
        activeMembershipIds: anyInputOrder,
      }),
    ).toEqual({
      seed: '992d6703dcfd88b4a522aa53f06ed0f81fe22dcb855bfd2a278c86fa4a353400',
      order: ['m03', 'm10', 'm06', 'm01', 'm09', 'm08', 'm02', 'm05', 'm07', 'm04'],
    });
  });

  it('matches an independent transcription of R2.3 for any members and seed (property)', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.uuid(), { minLength: 1, maxLength: 50 }),
        fc.stringMatching(/^[0-9a-f]{64}$/),
        (ids, seed) => {
          const order = verifiableShuffle(ids, seed);
          expect(order).toEqual(referenceShuffle(ids, seed));
          expect([...order].sort()).toEqual([...ids].sort());
        },
      ),
      { numRuns: 200 },
    );
  });

  it('refuses duplicate membership IDs', () => {
    expect(() => verifiableShuffle(['a', 'a'], GENESIS)).toThrow(RangeError);
  });

  it('adds the round number to the no-bid draw seed (R8.3)', () => {
    expect(biddingDrawSeed(GROUP, 1, 5, GENESIS)).toBe(
      '03df01557a30afdf87293f6443420f629add058bcd8d107e30d461effd854d36',
    );
  });
});
