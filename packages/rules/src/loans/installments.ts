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
  return Array.from({ length: input.months }, (_, i) => {
    const k = i + 1;
    return input.frequency === 'MONTHLY'
      ? place(index < 0 ? [] : rounds.slice(current + 1), { nthRound: k, onOrAfter: null })
      : place(rounds.slice(current), {
          nthRound: null,
          onOrAfter: addCalendarMonths(input.approvedAt, k),
        });
  });
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
  return installments.map((due) =>
    due.status === 'DATED'
      ? due
      : due.nthRound !== null
        ? place(sorted, { nthRound: due.nthRound, onOrAfter: null })
        : place(sorted, { nthRound: null, onOrAfter: due.onOrAfter }),
  );
}
