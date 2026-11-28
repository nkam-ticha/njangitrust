// The combined summary of every group the member is in (FSD GRP-05, GET /v1/me/summary). Every figure
// comes from the group's own service (rounds, payments, payouts, chat, proposals), so it matches the
// group's screens to the franc. The only arithmetic is the rules package's `sumFcfa`; nothing is added
// across groups.
import { sumFcfa } from '@njangi/rules';
import type { CombinedSummaryDto, SummaryGroupDto } from '@njangi/shared/contracts/me';
import { isAppError } from '../../lib/errors';
import { getPrisma } from '../../lib/prisma';
import { getChatStates } from '../chat';
import { listMyDues } from '../payments';
import { readMyMoney } from '../payouts';
import { listProposals } from '../proposals';
import { currentRound } from '../rounds/rounds.service';

/** A group that cannot answer (a refusal of its own service) counts as nothing, not as an error. */
async function orElse<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (isAppError(error)) return fallback;
    throw error;
  }
}

async function summaryOf(
  userId: string,
  group: { id: string; name: string; status: 'FORMING' | 'ACTIVE' },
  role: 'ADMIN' | 'MEMBER',
  unreadMessages: number,
): Promise<SummaryGroupDto> {
  const started = group.status === 'ACTIVE';
  const [round, dues, money, proposals] = await Promise.all([
    started ? orElse(() => currentRound(userId, group.id), null) : null,
    started ? orElse(() => listMyDues(userId, group.id), []) : [],
    started ? orElse(() => readMyMoney(userId, group.id), null) : null,
    orElse(() => listProposals(userId, group.id, { status: 'OPEN' }), []),
  ]);
  return {
    groupId: group.id,
    name: group.name,
    role,
    status: group.status,
    currentRound: round
      ? {
          number: round.round.number,
          total: round.round.totalRounds,
          dueAt: round.round.dueAt,
        }
      : null,
    myDue: sumFcfa(dues.map((due) => due.amount)),
    available: money?.available ?? 0,
    unreadMessages,
    openVotes: proposals.filter((view) => view.viewer.canVote).length,
  };
}

export async function combinedSummary(userId: string): Promise<CombinedSummaryDto> {
  const [memberships, chatStates] = await Promise.all([
    getPrisma().membership.findMany({
      // Members who are in the group now; D28: nothing from a group a developer closed and hid.
      where: {
        userId,
        status: { in: ['ACTIVE', 'LEAVING'] },
        group: { status: { in: ['FORMING', 'ACTIVE'] }, hiddenByDeveloperAt: null },
      },
      orderBy: { createdAt: 'asc' },
      select: { role: true, group: { select: { id: true, name: true, status: true } } },
    }),
    getChatStates(userId),
  ]);
  const unread = new Map(chatStates.map((state) => [state.groupId, state.unread]));
  const groups = await Promise.all(
    memberships.map(({ role, group }) =>
      summaryOf(
        userId,
        { id: group.id, name: group.name, status: group.status as 'FORMING' | 'ACTIVE' },
        role,
        unread.get(group.id) ?? 0,
      ),
    ),
  );
  return { groups };
}
