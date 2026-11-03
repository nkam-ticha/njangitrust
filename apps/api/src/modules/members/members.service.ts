// Group members (spec 2.7 GET /groups/:id/members). Selects only the fields the mappers need:
// no phone number is ever read here.
import { getPrisma } from '../../lib/prisma';
import { authorizeGroup, type MembershipRef } from '../../permissions';
import type { MemberSource } from '../../dto';

const LISTED = ['INVITED', 'ACTIVE', 'LEAVING'] as const;

export async function listMembers(
  userId: string,
  groupId: string,
): Promise<{ viewer: MembershipRef; members: MemberSource[] }> {
  const access = await authorizeGroup(userId, groupId, 'group.members.read');
  const members = await getPrisma().membership.findMany({
    where: { groupId, status: { in: [...LISTED] } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      role: true,
      status: true,
      createdAt: true,
      activeFromCycle: true,
      leftAt: true,
      user: { select: { name: true } },
    },
  });
  return { viewer: access.membership, members };
}
