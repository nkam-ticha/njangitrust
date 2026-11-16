// Reliability score from a member's obligations (R14), for the statement's last section.

import { reliabilityScore, roundItemOnTime, type ReliabilityItem } from '../reliability';
import type { ObligationFact, StatementReliability } from './types';

/** R3.5: a paid obligation is on time when its flag says so; anything unpaid is not. */
const wasOnTime = (o: ObligationFact): boolean =>
  (o.status === 'PAID' || o.status === 'SETTLED') && o.onTime === true;

/**
 * R14.1: one item per round (its contribution and its solidarity counted together, late if either
 * is) and one per loan installment. Cancelled obligations and every other kind are left out; so is a
 * round without a contribution obligation (cancelled, or not among the facts): a contribution that
 * is not there is never taken as paid on time.
 */
export function reliabilityItemsOf(facts: readonly ObligationFact[]): ReliabilityItem[] {
  const rounds = new Map<
    string,
    { dueAt: Date; contribution: boolean | null; solidarity: boolean | null }
  >();
  const items: ReliabilityItem[] = [];
  for (const o of facts) {
    if (o.status === 'CANCELLED') continue;
    if (o.kind === 'LOAN_INSTALLMENT') {
      items.push({ kind: 'INSTALLMENT', dueAt: new Date(o.dueAt), onTime: wasOnTime(o) });
    } else if ((o.kind === 'CONTRIBUTION' || o.kind === 'SOLIDARITY') && o.roundId) {
      const round = rounds.get(o.roundId) ?? {
        dueAt: new Date(o.dueAt),
        contribution: null,
        solidarity: null,
      };
      if (o.kind === 'CONTRIBUTION') round.contribution = wasOnTime(o);
      else round.solidarity = wasOnTime(o);
      rounds.set(o.roundId, round);
    }
  }
  for (const round of rounds.values()) {
    if (round.contribution === null) continue;
    items.push({
      kind: 'ROUND',
      dueAt: round.dueAt,
      onTime: roundItemOnTime({
        contributionOnTime: round.contribution,
        solidarityOnTime: round.solidarity,
      }),
    });
  }
  return items;
}

/** R14: the score a statement prints, with the counts and the window it used. */
export function memberReliability(input: {
  facts: readonly ObligationFact[];
  reliabilityWindow: number;
  now: Date;
}): StatementReliability {
  const result = reliabilityScore({
    items: reliabilityItemsOf(input.facts),
    reliabilityWindow: input.reliabilityWindow,
    now: input.now,
  });
  return result.kind === 'SCORE'
    ? {
        newMember: false,
        score: result.score,
        onTime: result.onTime,
        due: result.due,
        window: input.reliabilityWindow,
      }
    : { newMember: true, score: null, onTime: 0, due: result.due, window: input.reliabilityWindow };
}
