// The verifiable draw (R2.3) and the no-bid draw of bidding mode (R8.3).

import { sha256Hex } from '../crypto';

/** R2.3: seed = SHA-256(groupId + "|" + cycleNumber + "|" + latest ledger hash at draw time). */
export function drawSeed(groupId: string, cycleNumber: number, latestLedgerHash: string): string {
  return sha256Hex(`${groupId}|${cycleNumber}|${latestLedgerHash}`);
}

/** R8.3: seed of the no-bid draw, SHA-256(groupId | cycle | round | latest ledger hash). */
export function biddingDrawSeed(
  groupId: string,
  cycleNumber: number,
  roundNumber: number,
  latestLedgerHash: string,
): string {
  return sha256Hex(`${groupId}|${cycleNumber}|${roundNumber}|${latestLedgerHash}`);
}

/**
 * R2.3: sorts the IDs ascending, then Fisher–Yates: for i from n − 1 down to 1, swap item i with
 * item j = parseInt(SHA-256(seed + "|" + i).slice(0, 12), 16) mod (i + 1).
 */
export function verifiableShuffle(membershipIds: readonly string[], seed: string): string[] {
  const order = [...membershipIds].sort();
  for (let k = 1; k < order.length; k++) {
    if (order[k] === order[k - 1]) throw new RangeError(`duplicate membership ID ${order[k]}`);
  }
  for (let i = order.length - 1; i >= 1; i--) {
    // 12 hex digits = 48 bits, always a safe integer.
    const j = parseInt(sha256Hex(`${seed}|${i}`).slice(0, 12), 16) % (i + 1);
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  return order;
}

/** R2.3: the verifiable draw of a FIXED cycle's rotation. Record seed and order in an EVENT. */
export function drawRotation(input: {
  groupId: string;
  cycleNumber: number;
  latestLedgerHash: string;
  activeMembershipIds: readonly string[];
}): { seed: string; order: string[] } {
  const seed = drawSeed(input.groupId, input.cycleNumber, input.latestLedgerHash);
  return { seed, order: verifiableShuffle(input.activeMembershipIds, seed) };
}
