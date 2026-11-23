// What members still hold in a group: the queries only. Which loans are live, what a settled
// balance is and when the counts mean "money is held" are rules (packages/rules, holdings). Used
// by the account deletion (this member leaves) and by a developer closing a group (D28: no member
// is left holding money in a group nobody can use).
import {
  holdsMoney as rulesHoldsMoney,
  LIVE_LOAN_STATUSES,
  nonZeroBalanceCount,
  type HeldMoneyCounts,
} from '@njangi/rules';
import type { Db } from '../../lib/prisma';

export type HeldMoney = HeldMoneyCounts;

export const holdsMoney = (held: HeldMoney): boolean => rulesHoldsMoney(held);

export async function moneyHeldBy(db: Db, membershipIds: readonly string[]): Promise<HeldMoney> {
  if (membershipIds.length === 0) return { obligations: 0, loans: 0, balances: 0 };
  const ids = [...membershipIds];
  const [obligations, loans, sums] = await Promise.all([
    db.obligation.count({ where: { membershipId: { in: ids }, status: 'DUE' } }),
    db.loan.count({
      where: { membershipId: { in: ids }, status: { in: [...LIVE_LOAN_STATUSES] } },
    }),
    db.ledgerPosting.groupBy({
      by: ['account'],
      where: {
        account: {
          in: ids.flatMap((id) => [`payable:member:${id}`, `receivable:member:${id}`]),
        },
      },
      _sum: { amount: true },
    }),
  ]);
  return {
    obligations,
    loans,
    balances: nonZeroBalanceCount(
      sums.map((row) => ({ account: row.account, amount: row._sum.amount })),
    ),
  };
}
