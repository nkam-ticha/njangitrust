// Reliability score (R14).

import { roundHalfUpDiv } from '../money';
import { assertDate } from '../time';

/** R14.2: below this many due items the member shows "Nouveau membre". */
export const MIN_ITEMS_FOR_SCORE = 3;

/**
 * R14.1: one item per round (contribution and solidarity counted together) or per loan
 * installment. `onTime` follows R3.5.
 */
export interface ReliabilityItem {
  kind: 'ROUND' | 'INSTALLMENT';
  dueAt: Date;
  onTime: boolean;
}

/** R14.1: a round counts as on time only when its contribution and its solidarity both were. */
export function roundItemOnTime(input: {
  contributionOnTime: boolean;
  solidarityOnTime: boolean | null;
}): boolean {
  return input.contributionOnTime && input.solidarityOnTime !== false;
}

/**
 * R14.1, R14.2: score = round(100 × on-time items / due items) over the member's last
 * `reliabilityWindow` items whose due date has passed; "Nouveau membre" with fewer than 3.
 */
export function reliabilityScore(input: {
  items: readonly ReliabilityItem[];
  reliabilityWindow: number;
  now: Date;
}):
  | { kind: 'SCORE'; score: number; onTime: number; due: number }
  | { kind: 'NEW_MEMBER'; due: number } {
  const now = assertDate(input.now, 'now');
  const window = input.items
    .filter((i) => assertDate(i.dueAt, 'dueAt') <= now)
    .sort((a, b) => b.dueAt.getTime() - a.dueAt.getTime())
    .slice(0, input.reliabilityWindow);
  const due = window.length;
  if (due < MIN_ITEMS_FOR_SCORE) return { kind: 'NEW_MEMBER', due };
  const onTime = window.filter((i) => i.onTime).length;
  return { kind: 'SCORE', score: roundHalfUpDiv(100 * onTime, due), onTime, due };
}
