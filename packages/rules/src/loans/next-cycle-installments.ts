// Loan installments waiting for the next cycle (D18.2, D16.3): rebuilt from what is stored, then
// dated at the new cycle's round deadlines.

import { addCalendarMonths, assertDate, type Frequency } from '../time';
import { redateNextCycleInstallments, type InstallmentDue } from './installments';

/**
 * D18.2: when a cycle starts, each installment still waiting (no round yet) takes the corresponding
 * round deadline of the new cycle. Nothing but stored facts is needed:
 * - `installments` are ALL of one loan's installments, paid or not, `dated` meaning it already
 *   belongs to a round; position k (by deadline, then id) is its number in the loan. A `settled`
 *   one (paid early) is not returned but still holds its place in the count (M2);
 * - monthly groups (D16.3, R7.3): the waiting ones are the n-th rounds of the new cycle, n counted
 *   among the installments that have no round yet, paid early or not (1, 2, ...);
 * - weekly, two-weekly and custom groups: installment k is due at the first deadline on or after the
 *   approval date plus k calendar months, and strictly after the previous installment's round (C):
 *   never two installments of one loan on the same round;
 * `rounds` are the new cycle's round dates. Returns one entry per waiting installment: DATED, or still
 * NEXT_CYCLE when it falls beyond the new cycle too.
 */
export function redateOwedInstallments(input: {
  frequency: Frequency;
  approvedAt: Date;
  installments: readonly { id: string; dueAt: Date; dated: boolean; settled?: boolean }[];
  rounds: readonly { dueAt: Date; payoutAt: Date }[];
}): { id: string; due: InstallmentDue }[] {
  assertDate(input.approvedAt, 'approvedAt');
  const ordered = [...input.installments].sort(
    (a, b) => assertDate(a.dueAt) - assertDate(b.dueAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const waiting: { id: string; due: InstallmentDue }[] = [];
  /** Installments without a round so far, paid early or not: the monthly rank counts them all. */
  let ranked = 0;
  ordered.forEach((installment, index) => {
    if (installment.dated) return;
    const k = index + 1;
    const rank = ranked + 1;
    ranked += 1;
    if (installment.settled) return;
    waiting.push({
      id: installment.id,
      due:
        input.frequency === 'MONTHLY'
          ? { status: 'NEXT_CYCLE', nthRound: rank, onOrAfter: null }
          : {
              status: 'NEXT_CYCLE',
              nthRound: null,
              onOrAfter: addCalendarMonths(input.approvedAt, k),
            },
    });
  });
  const dated = redateNextCycleInstallments(
    waiting.map((w) => w.due),
    input.rounds,
  );
  return waiting.map((w, i) => ({ id: w.id, due: dated[i]! }));
}
