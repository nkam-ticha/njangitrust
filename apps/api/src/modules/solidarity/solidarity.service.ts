// The solidarity fund as members see it (spec R10, FSD SOL-01): its balance and the requests.
// A new request is a SOLIDARITY_PAYOUT proposal (proposals module).
import { getPrisma } from '../../lib/prisma';
import { authorizeGroup } from '../../permissions';
import { moneyPort } from '../proposals';

export async function readSolidarity(userId: string, groupId: string) {
  await authorizeGroup(userId, groupId, 'group.solidarity.read');
  const prisma = getPrisma();
  const port = moneyPort();
  const [fund, requests] = await Promise.all([
    port ? port.solidarityFund(prisma, groupId) : Promise.resolve(null),
    prisma.solidarityRequest.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        recipient: { select: { id: true, user: { select: { name: true } } } },
        requester: { select: { id: true, user: { select: { name: true } } } },
      },
    }),
  ]);
  return { fundBalance: fund ? fund.balance : null, requests };
}
