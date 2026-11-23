// What members still hold in a group: the queries only. Which loans are live, what a settled
// balance is and when the counts mean "money is held" are rules (packages/rules, holdings). Used
// by the account deletion (this member leaves) and by a developer closing a group (D28: no member
// is left holding money in a group nobody can use).
import {
  holdsMoney as rulesHoldsMoney,
  LIVE_LOAN_STATUSES,
  nonZeroBalanceCount,
  payableAccount,
  receivableAccount,
  type HeldMoneyCounts,
} from '@njangi/rules';
import type { Db } from '../../lib/prisma';

export type HeldMoney = HeldMoneyCounts;

export const holdsMoney = (held: HeldMoney): boolean => rulesHoldsMoney(held);

/**
 * D10, D28: the bidding pots of a group that hold money. A pot (`pot:round:<id>`) takes the
 * contributions paid before the bids close and belongs to no member yet, so it is counted for the
 * group, never for a member. Closing a group would leave it unassigned for good (`bids.close` skips
 * a closed group).
 */
export async function potsHeldIn(db: Db, groupId: string): Promise<number> {
  const sums = await db.ledgerPosting.groupBy({
    by: ['account'],
    where: { account: { startsWith: 'pot:round:' }, transaction: { groupId } },
    _sum: { amount: true },
  });
  return nonZeroBalanceCount(
    sums.map((row) => ({ account: row.account, amount: row._sum.amount })),
  );
}

/**
 * What the members hold: debts, live loans, balances. With `groupId`, the group's pots too (a
 * group's closing); without it `pots` is 0, since a pot is the group's money, not a member's.
 */
export async function moneyHeldBy(
  db: Db,
  membershipIds: readonly string[],
  groupId?: string,
): Promise<HeldMoney> {
  const pots = groupId ? await potsHeldIn(db, groupId) : 0;
  if (membershipIds.length === 0) return { obligations: 0, loans: 0, balances: 0, pots };
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
          in: ids.flatMap((id) => [payableAccount(id), receivableAccount(id)]),
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
    pots,
  };
}
