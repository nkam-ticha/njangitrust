import { describe, expect, it } from 'vitest';
import { installmentDueDates, redateNextCycleInstallments } from './installments';
import { redateOwedInstallments } from './next-cycle-installments';

const round = (day: number) => ({
  dueAt: new Date(Date.UTC(2027, 0, day - 1, 12)),
  payoutAt: new Date(Date.UTC(2027, 0, day, 12)),
});

describe('re-dating loan installments when the next cycle starts (D18.2, D16.3)', () => {
  it('monthly: the waiting installments take the first rounds of the new cycle, in order', () => {
    const dueAt = (m: number) => new Date(Date.UTC(2026, m, 27, 12));
    const result = redateOwedInstallments({
      frequency: 'MONTHLY',
      approvedAt: new Date('2026-10-01T10:00:00Z'),
      installments: [
        { id: 'i1', dueAt: dueAt(10), dated: true },
        { id: 'i2', dueAt: dueAt(11), dated: false },
        { id: 'i3', dueAt: dueAt(12), dated: false },
      ],
      rounds: [round(5), round(12), round(19)],
    });
    expect(result).toEqual([
      { id: 'i2', due: { status: 'DATED', dueAt: round(5).dueAt } },
      { id: 'i3', due: { status: 'DATED', dueAt: round(12).dueAt } },
    ]);
  });

  it('monthly: one still beyond the new cycle keeps waiting, and the rest of its wait is counted', () => {
    const result = redateOwedInstallments({
      frequency: 'MONTHLY',
      approvedAt: new Date('2026-10-01T10:00:00Z'),
      installments: [
        { id: 'a', dueAt: new Date('2026-12-01T00:00:00Z'), dated: false },
        { id: 'b', dueAt: new Date('2027-01-01T00:00:00Z'), dated: false },
        { id: 'c', dueAt: new Date('2027-02-01T00:00:00Z'), dated: false },
      ],
      rounds: [round(5), round(12)],
    });
    expect(result[0]).toEqual({ id: 'a', due: { status: 'DATED', dueAt: round(5).dueAt } });
    expect(result[1]).toEqual({ id: 'b', due: { status: 'DATED', dueAt: round(12).dueAt } });
    expect(result[2]).toEqual({
      id: 'c',
      due: { status: 'NEXT_CYCLE', nthRound: 1, onOrAfter: null },
    });
  });

  it('weekly: each takes the first round deadline on or after approval plus k months', () => {
    const approvedAt = new Date('2026-12-10T10:00:00Z');
    const result = redateOwedInstallments({
      frequency: 'WEEKLY',
      approvedAt,
      installments: [
        { id: 'i1', dueAt: new Date('2027-01-09T00:00:00Z'), dated: false },
        { id: 'i2', dueAt: new Date('2027-02-09T00:00:00Z'), dated: false },
      ],
      rounds: [round(8), round(15), round(22), round(29)],
    });
    // Approval + 1 month = 10 Jan 2027 12:00 (Douala conversion aside): the first deadline on or
    // after it is 14 Jan (round of the 15th); + 2 months = 10 Feb, beyond the cycle.
    expect(result[0]!.due).toEqual({ status: 'DATED', dueAt: round(15).dueAt });
    expect(result[1]!.due.status).toBe('NEXT_CYCLE');
  });

  it('agrees with installmentDueDates then redateNextCycleInstallments (the stored pieces are enough)', () => {
    const approvedAt = new Date('2026-11-20T10:00:00Z');
    const current = [
      { dueAt: new Date('2026-11-25T00:00:00Z'), payoutAt: new Date('2026-11-26T00:00:00Z') },
      { dueAt: new Date('2026-12-25T00:00:00Z'), payoutAt: new Date('2026-12-26T00:00:00Z') },
    ];
    const direct = installmentDueDates({
      approvedAt,
      months: 3,
      frequency: 'MONTHLY',
      rounds: current,
    });
    expect(direct.filter((d) => d.status === 'NEXT_CYCLE')).toHaveLength(2);
    const viaStored = redateOwedInstallments({
      frequency: 'MONTHLY',
      approvedAt,
      installments: direct.map((d, i) => ({
        id: `i${i + 1}`,
        dueAt: d.status === 'DATED' ? d.dueAt : new Date(Date.UTC(2027, i, 1)),
        dated: d.status === 'DATED',
      })),
      rounds: [round(5), round(12)],
    });
    expect(viaStored.map((r) => r.due)).toEqual(
      redateNextCycleInstallments(
        direct.filter((d) => d.status === 'NEXT_CYCLE'),
        [round(5), round(12)],
      ),
    );
  });

  it('monthly: an installment paid early still holds its place, so the next one keeps its round (M2)', () => {
    const result = redateOwedInstallments({
      frequency: 'MONTHLY',
      approvedAt: new Date('2026-10-01T10:00:00Z'),
      installments: [
        { id: 'i1', dueAt: new Date('2026-11-01T00:00:00Z'), dated: true },
        { id: 'i2', dueAt: new Date('2026-12-01T00:00:00Z'), dated: false, settled: true },
        { id: 'i3', dueAt: new Date('2027-01-01T00:00:00Z'), dated: false },
      ],
      rounds: [round(5), round(12), round(19)],
    });
    // i2 was the 1st waiting installment (paid), so i3 is the 2nd: the new cycle's round 2.
    expect(result).toEqual([{ id: 'i3', due: { status: 'DATED', dueAt: round(12).dueAt } }]);
  });

  it('weekly after a late start: never two installments of one loan on the same round (C)', () => {
    const waiting = ['a', 'b', 'c'].map((id, i) => ({
      id,
      dueAt: new Date(Date.UTC(2026, 9 + i, 1)),
      dated: false,
    }));
    // Approved long ago: every "approval plus k months" date is before the new cycle's first round.
    const input = {
      frequency: 'WEEKLY' as const,
      approvedAt: new Date('2026-09-01T10:00:00Z'),
      installments: waiting,
    };
    const roundsOf = (n: number) => [5, 12, 19, 26].slice(0, n).map(round);
    expect(redateOwedInstallments({ ...input, rounds: roundsOf(4) }).map((r) => r.due)).toEqual([
      { status: 'DATED', dueAt: round(5).dueAt },
      { status: 'DATED', dueAt: round(12).dueAt },
      { status: 'DATED', dueAt: round(19).dueAt },
    ]);
    // Only two rounds: the third waits for the cycle after (and keeps its date).
    const two = redateOwedInstallments({ ...input, rounds: roundsOf(2) });
    expect(two.map((r) => r.due.status)).toEqual(['DATED', 'DATED', 'NEXT_CYCLE']);
    const rounds = two.flatMap((r) => (r.due.status === 'DATED' ? [r.due.dueAt.getTime()] : []));
    expect(new Set(rounds).size).toBe(rounds.length);
  });

  it('a placement is later than the previous one, but still on or after its own date (C)', () => {
    const result = redateOwedInstallments({
      frequency: 'BIWEEKLY',
      approvedAt: new Date('2026-12-20T10:00:00Z'),
      installments: [
        { id: 'a', dueAt: new Date('2027-01-20T00:00:00Z'), dated: false },
        { id: 'b', dueAt: new Date('2027-02-20T00:00:00Z'), dated: false },
      ],
      // a: on or after 20 Jan -> round on the 26th. b: on or after 20 Feb -> none left.
      rounds: [5, 12, 19, 26].map(round),
    });
    expect(result[0]!.due).toEqual({ status: 'DATED', dueAt: round(26).dueAt });
    expect(result[1]!.due.status).toBe('NEXT_CYCLE');
  });

  it('is deterministic whatever order the installments arrive in, and ignores dated ones', () => {
    const list = [
      { id: 'b', dueAt: new Date('2027-01-01T00:00:00Z'), dated: false },
      { id: 'a', dueAt: new Date('2026-12-01T00:00:00Z'), dated: false },
      { id: 'z', dueAt: new Date('2026-11-01T00:00:00Z'), dated: true },
    ];
    const input = {
      frequency: 'MONTHLY' as const,
      approvedAt: new Date('2026-10-01T00:00:00Z'),
      rounds: [round(5), round(12)],
    };
    const x = redateOwedInstallments({ ...input, installments: list });
    const y = redateOwedInstallments({ ...input, installments: [...list].reverse() });
    expect(x).toEqual(y);
    expect(x.map((r) => r.id)).toEqual(['a', 'b']);
  });
});
