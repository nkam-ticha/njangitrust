// Payout time opens withdrawals (R5) and applies due debts before money is available.
import { getPrisma } from '../../lib/prisma';
import { clock } from '../../lib/clock';
import { settleDueDebts } from './payouts.settlement';

export async function openPayout(roundId: string, now = clock.now()): Promise<boolean> {
  return getPrisma().$transaction(async (tx) => {
    const round = await tx.round.findUnique({ where: { id: roundId } });
    if (!round || round.status !== 'OPEN' || round.payoutAt > now || !round.beneficiaryMembershipId)
      return false;
    const changed = await tx.round.updateMany({
      where: {
        id: round.id,
        status: 'OPEN',
        payoutAt: { lte: now },
        beneficiaryMembershipId: { not: null },
      },
      data: { status: 'PAYOUT' },
    });
    if (changed.count !== 1) return false;
    await settleDueDebts(tx, {
      groupId: round.groupId,
      membershipId: round.beneficiaryMembershipId,
      roundId: round.id,
      now,
    });
    return true;
  });
}

export async function openDuePayouts(now = clock.now()): Promise<number> {
  const due = await getPrisma().round.findMany({
    where: { status: 'OPEN', payoutAt: { lte: now }, beneficiaryMembershipId: { not: null } },
    select: { id: true },
    orderBy: { payoutAt: 'asc' },
    take: 100,
  });
  let opened = 0;
  for (const round of due) if (await openPayout(round.id, now)) opened += 1;
  return opened;
}
