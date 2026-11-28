// When loan installments fall due (R7.3, D16.3, D18.2).

import { addCalendarMonths, assertDate, type Frequency } from '../time';

/**
 * D18.2: an installment is DATED (due at a round deadline of the current cycle), or waits for the
 * next cycle: "due at a round of the next cycle". Monthly groups count rounds (`nthRound` of the next
 * cycle, R7.3); weekly and two-weekly groups keep the date it must fall on or after (`onOrAfter`).
 */
export type InstallmentDue =
  | { status: 'DATED'; dueAt: Date }
  | { status: 'NEXT_CYCLE'; nthRound: number; onOrAfter: null }
  | { status: 'NEXT_CYCLE'; nthRound: null; onOrAfter: Date };

type RoundDates = { dueAt: Date; payoutAt: Date };

/** D16.3, D18.2: places one installment among `rounds`, the deadlines it may use, in order. */
function place(
  rounds: readonly RoundDates[],
  rule: { nthRound: number; onOrAfter: null } | { nthRound: null; onOrAfter: Date },
): InstallmentDue {
  if (rule.nthRound !== null) {
    const round = rounds[rule.nthRound - 1];
    return round
      ? { status: 'DATED', dueAt: round.dueAt }
      : { status: 'NEXT_CYCLE', nthRound: rule.nthRound - rounds.length, onOrAfter: null };
  }
  const round = rounds.find((r) => r.dueAt.getTime() >= rule.onOrAfter.getTime());
  return round
    ? { status: 'DATED', dueAt: round.dueAt }
    : { status: 'NEXT_CYCLE', nthRound: null, onOrAfter: rule.onOrAfter };
}

/**
 * C: places date-based installments (weekly, two-weekly, custom) in order, each on the first round
 * deadline on or after its date that is STRICTLY LATER than the round of the previous installment
 * of the same loan: two installments of one loan never share a round. When no such round is left
 * it stays NEXT_CYCLE with its date.
 */
function placeInOrder(rounds: readonly RoundDates[], onOrAfter: readonly Date[]): InstallmentDue[] {
  let after = -1;
  return onOrAfter.map((date) => {
    const index = rounds.findIndex((r, i) => i > after && r.dueAt.getTime() >= date.getTime());
    if (index < 0) {
      after = rounds.length;
      return { status: 'NEXT_CYCLE', nthRound: null, onOrAfter: date };
    }
    after = index;
    return { status: 'DATED', dueAt: rounds[index]!.dueAt };
  });
}

const byPayout = (rounds: readonly RoundDates[]) =>
  [...rounds].sort((a, b) => assertDate(a.payoutAt) - assertDate(b.payoutAt));

/**
 * D16.3, R7.3, LOA-02, D18.2: in a monthly group, installment k is due at the deadline of the k-th
 * round after the round in progress at approval (R7.3). In a weekly or two-weekly group, installment k
 * is due at the first round deadline on or after the approval date plus k calendar months.
 * `rounds` are the CURRENT cycle's round dates (roundDates / roundDatesInSegments), the round in
 * progress included; an installment beyond the cycle's last round is NEXT_CYCLE until the next cycle
 * starts (redateNextCycleInstallments). Approved after the cycle's last payout, every installment
 * waits for the next cycle (its rounds are then "the next rounds").
 */
export function installmentDueDates(input: {
  approvedAt: Date;
  months: number;
  frequency: Frequency;
  rounds: readonly RoundDates[];
}): InstallmentDue[] {
  if (!Number.isSafeInteger(input.months) || input.months < 1) {
    throw new RangeError('months must be 1 or more');
  }
  const approved = assertDate(input.approvedAt, 'approvedAt');
  const rounds = byPayout(input.rounds);
  const index = rounds.findIndex((r) => r.payoutAt.getTime() > approved);
  const current = index < 0 ? rounds.length : index;
  if (input.frequency !== 'MONTHLY') {
    return placeInOrder(
      rounds.slice(current),
      Array.from({ length: input.months }, (_, i) => addCalendarMonths(input.approvedAt, i + 1)),
    );
  }
  return Array.from({ length: input.months }, (_, i) =>
    place(index < 0 ? [] : rounds.slice(current + 1), { nthRound: i + 1, onOrAfter: null }),
  );
}

/**
 * D18.2: when a cycle starts, each NEXT_CYCLE installment takes the corresponding round deadline of
 * the new cycle (`rounds`: all its round dates): the nth round in a monthly group, the first deadline
 * on or after its date otherwise. One that still falls beyond waits for the following cycle.
 */
export function redateNextCycleInstallments(
  installments: readonly InstallmentDue[],
  rounds: readonly RoundDates[],
): InstallmentDue[] {
  const sorted = byPayout(rounds);
  // C: the date-based waiting ones are placed together, in order, one round each.
  const dated = placeInOrder(
    sorted,
    installments.flatMap((due) =>
      due.status === 'NEXT_CYCLE' && due.nthRound === null ? [due.onOrAfter] : [],
    ),
  );
  let next = 0;
  return installments.map((due) =>
    due.status === 'DATED'
      ? due
      : due.nthRound !== null
        ? place(sorted, { nthRound: due.nthRound, onOrAfter: null })
        : dated[next++]!,
  );
}
