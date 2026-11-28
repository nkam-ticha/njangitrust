// What happens to the general fund when a cycle closes (R9.3, R9.4, R7.8, R12.2, D40). Pure: the
// service loads the figures (ledger balances, unpaid obligations, membership) and calls this.

import type { Fcfa } from '../money';
import { fundDistribution, type DistributionCandidate } from './distribution';

export type CloseMemberStatus = 'INVITED' | 'ACTIVE' | 'LEAVING' | 'LEFT' | 'REMOVED';

/** One membership of the group at the moment the cycle closes. */
export interface CycleCloseMember {
  membershipId: string;
  status: CloseMemberStatus;
  activeFromCycle: number | null;
  /** D40.1: the member's DUE obligations as debtor, of every kind, due yet or not (FCFA total). */
  unpaidObligations: Fcfa;
  /** R7.8: the member's receivable in the ledger (loan balance, fines, bids, corrections). */
  receivable: Fcfa;
}

export interface CycleCloseFacts {
  cycleNumber: number;
  distributeFundAtCycleEnd: boolean;
  /** Ledger balances as people read them (2.5): general fund, all receivables, available for loans. */
  generalFund: Fcfa;
  receivables: Fcfa;
  availableForLoans: Fcfa;
  /** The cycle's final rotation (in bidding mode only the members, in no particular order). Candidates come back in this order. */
  rotation: readonly string[];
  members: readonly CycleCloseMember[];
}

function inRotationOrder<T extends { membershipId: string }>(
  rotation: readonly string[],
  items: readonly T[],
): T[] {
  const position = new Map(rotation.map((id, i) => [id, i] as const));
  return [...items].sort((a, b) => {
    const pa = position.get(a.membershipId);
    const pb = position.get(b.membershipId);
    if (pa !== undefined && pb !== undefined) return pa - pb;
    if (pa !== undefined) return -1;
    if (pb !== undefined) return 1;
    return a.membershipId < b.membershipId ? -1 : a.membershipId > b.membershipId ? 1 : 0;
  });
}

/**
 * R9.3, R9.4, D40.5: members active or leaving at the close take part (a leaver announced R12.2 counts
 * as active during the cycle); members who left earlier (LEFT, REMOVED) and those not yet active
 * (INVITED) do not. `activeWholeCycle` is false for anyone who joined after this cycle started.
 * D40.1, R7.8: `outstandingDebt` is the larger of the unpaid obligations and the ledger receivable
 * (a loan's balance may sit in either), so any debt at all removes the share.
 */
export function cycleCloseCandidates(input: {
  cycleNumber: number;
  rotation: readonly string[];
  members: readonly CycleCloseMember[];
}): DistributionCandidate[] {
  const taking = input.members.filter((m) => m.status === 'ACTIVE' || m.status === 'LEAVING');
  return inRotationOrder(input.rotation, taking).map((m) => ({
    membershipId: m.membershipId,
    // X1: no recorded start (null) counts as cycle 1, as the read side does.
    activeWholeCycle: (m.activeFromCycle ?? 1) <= input.cycleNumber,
    outstandingDebt: Math.max(m.unpaidObligations, m.receivable),
  }));
}

export type CycleCloseReason = 'DISTRIBUTION_OFF' | 'NOTHING_TO_DISTRIBUTE' | 'NO_ELIGIBLE_MEMBER';

/** The figures the CYCLE_CLOSED event records (integers only). */
export interface CycleCloseEventFacts {
  fundBalance: Fcfa;
  receivables: Fcfa;
  availableForLoans: Fcfa;
  distributable: Fcfa;
  share: Fcfa;
  distributed: Fcfa;
  remainder: Fcfa;
  eligibleCount: number;
  reason: CycleCloseReason | null;
}

/**
 * R9.3: the plan for closing a cycle: who shares what (see `fundDistribution`), who leaves with the
 * cycle (R12.2), and the facts for the ledger event. The remainder, and everything when nothing is
 * shared, stays in the general fund.
 */
export function planCycleClose(facts: CycleCloseFacts): {
  candidates: DistributionCandidate[];
  eligibleCount: number;
  leavingMembershipIds: string[];
  distribution: ReturnType<typeof fundDistribution>;
  event: CycleCloseEventFacts;
} {
  const generalFund = Math.max(0, facts.generalFund);
  const receivables = Math.max(0, facts.receivables);
  const available = Math.max(0, facts.availableForLoans);
  const candidates = cycleCloseCandidates(facts);
  const eligibleCount = candidates.filter(
    (c) => c.activeWholeCycle && c.outstandingDebt === 0,
  ).length;
  const leavingMembershipIds = inRotationOrder(
    facts.rotation,
    facts.members.filter((m) => m.status === 'LEAVING'),
  ).map((m) => m.membershipId);
  const distribution = fundDistribution({
    distributeFundAtCycleEnd: facts.distributeFundAtCycleEnd,
    generalFundBalance: generalFund,
    outstandingReceivables: receivables,
    availableForLoans: available,
    candidates,
  });
  const distributableAnyway = Math.min(Math.max(0, generalFund - receivables), available);
  const base = {
    fundBalance: generalFund,
    receivables,
    availableForLoans: available,
    eligibleCount,
  };
  const event: CycleCloseEventFacts = distribution.ok
    ? {
        ...base,
        distributable: distribution.distributable,
        share: distribution.share,
        distributed: distribution.distributed,
        remainder: distribution.remainder,
        reason: null,
      }
    : {
        ...base,
        distributable: distributableAnyway,
        share: 0,
        distributed: 0,
        remainder: distributableAnyway,
        reason: distribution.code,
      };
  return { candidates, eligibleCount, leavingMembershipIds, distribution, event };
}
