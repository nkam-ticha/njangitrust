// Pure helpers of the previous-rounds picker (Caisse > Tour): which rounds can be looked at, and who
// paid in one of them. The server states how many members paid and who did not; names of the payers
// are shown only when the member list agrees with that count (members join and leave over a cycle).

/** Earlier rounds of the cycle, the most recent first: round 4 in progress gives 3, 2, 1. */
export function earlierRounds(current: number): number[] {
  return Array.from({ length: Math.max(0, current - 1) }, (_, i) => current - 1 - i);
}

export interface MemberLite {
  membershipId: string;
  name: string;
  status: string;
}

export interface RoundPayers {
  /** Who did not pay in time, by name. */
  unpaid: string[];
  /** Who paid, by name; null when the member list cannot be matched to the server's count. */
  paid: string[] | null;
}

export function roundPayers(
  members: readonly MemberLite[],
  unpaidIds: readonly string[],
  paidCount: number,
): RoundPayers {
  const unpaidSet = new Set(unpaidIds);
  const unpaid = members.filter((m) => unpaidSet.has(m.membershipId)).map((m) => m.name);
  const candidates = members.filter(
    (m) => !unpaidSet.has(m.membershipId) && m.status !== 'INVITED',
  );
  return {
    unpaid,
    paid: candidates.length === paidCount ? candidates.map((m) => m.name) : null,
  };
}
