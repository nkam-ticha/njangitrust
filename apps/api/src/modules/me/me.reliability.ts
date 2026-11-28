// A member's reliability score in one group (spec R14, FSD STA-02). The score is the rules package's
// `memberReliability`; this file only reads the member's obligations and hands them over.
import { memberReliability, type ObligationFact } from '@njangi/rules';
import type { ReliabilityDto } from '@njangi/shared/contracts/me';
import { clock } from '../../lib/clock';
import { getPrisma, type Db } from '../../lib/prisma';
import { authorizeGroup } from '../../permissions';
import { getCurrentParams } from '../rulesets';

/** R14.1: only contributions, solidarity contributions and loan installments count. */
const RELIABILITY_KINDS = ['CONTRIBUTION', 'SOLIDARITY', 'LOAN_INSTALLMENT'] as const;

/** The score of one membership, for the endpoint, the combined summary and the data export. */
export async function reliabilityOfMembership(
  groupId: string,
  membershipId: string,
  db: Db = getPrisma(),
  now: Date = clock.now(),
): Promise<ReliabilityDto> {
  const [rows, params] = await Promise.all([
    db.obligation.findMany({
      where: { membershipId, kind: { in: [...RELIABILITY_KINDS] } },
      select: {
        id: true,
        membershipId: true,
        kind: true,
        amount: true,
        roundId: true,
        dueAt: true,
        status: true,
        paidAt: true,
        onTime: true,
        round: { select: { number: true } },
      },
      orderBy: { dueAt: 'asc' },
    }),
    getCurrentParams(groupId, db),
  ]);
  const facts: ObligationFact[] = rows.map((o) => ({
    id: o.id,
    membershipId: o.membershipId,
    kind: o.kind,
    amount: o.amount,
    roundId: o.roundId,
    roundNumber: o.round?.number ?? null,
    dueAt: o.dueAt.toISOString(),
    status: o.status,
    paidAt: o.paidAt?.toISOString() ?? null,
    onTime: o.onTime,
  }));
  const r = memberReliability({ facts, reliabilityWindow: params.reliabilityWindow, now });
  return { onTime: r.onTime, total: r.due, percent: r.score, window: r.window };
}

/** GET /groups/:groupId/me/reliability: the caller's own score; anyone who was a member may read it. */
export async function myReliability(userId: string, groupId: string): Promise<ReliabilityDto> {
  const access = await authorizeGroup(userId, groupId, 'group.statements.own');
  return reliabilityOfMembership(groupId, access.membership.id);
}
