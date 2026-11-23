// Ends every open vote of a group that is being closed (D28). Each one expires, never passes: its
// type's own "did not pass" step runs (a solidarity request or a loan waiting on the vote is
// released), the result is written to the hash chain like any closing (R11.8), and members' open
// screens are told. A secret vote's totals stay out of the live event (R11.5, D20.1).
import { AfterCommit, type EffectSink } from '../../lib/after-commit';
import type { Prisma } from '../../lib/prisma';
import { ui } from '../../lib/texts';
import { emitToGroup } from '../../realtime/emitter';
import { ledgerEventsPort } from './governance-ports';
import { memberNames } from './proposals.context';
import { proposalDefinition } from './types';

type Tx = Prisma.TransactionClient;

/** Expires the group's open proposals inside the caller's transaction; returns how many. */
export async function expireOpenProposalsOfGroup(
  tx: Tx,
  groupId: string,
  now: Date,
  effects: EffectSink = new AfterCommit(),
): Promise<number> {
  const open = await tx.proposal.findMany({
    where: { groupId, status: 'OPEN' },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (open.length === 0) return 0;
  const group = await tx.group.findUniqueOrThrow({
    where: { id: groupId },
    select: { id: true, name: true },
  });
  const names = await memberNames(tx, groupId);
  let expired = 0;
  for (const { id } of open) {
    await tx.$queryRaw`SELECT "id" FROM "Proposal" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const p = await tx.proposal.findUniqueOrThrow({ where: { id } });
    if (p.status !== 'OPEN') continue;
    const definition = proposalDefinition(p.type);
    const payload = definition.payload.parse(p.payload);
    const title = definition.describe(payload, names).title;
    await definition.onNotPassed?.({ tx, proposal: p, now, effects, group, names }, payload);
    await tx.proposal.update({ where: { id }, data: { status: 'EXPIRED', closedAt: now } });
    await ledgerEventsPort().appendEvent(tx, {
      groupId,
      event: {
        event: 'VOTE_CLOSED',
        proposalId: p.id,
        proposalType: p.type,
        status: 'EXPIRED',
        // A secret vote that ends early records only that it expired. Its totals are left out, not
        // zeroed: zero would claim that no ballot exists, a real total would leak the vote (R11.5).
        ...(p.secret ? {} : { yes: p.yesCount, no: p.noCount }),
        eligible: p.eligibleMembershipIds.length,
      },
      description: ui((c) => c.chat.system.voteExpired, { title }),
      refType: 'Proposal',
      refId: p.id,
      occurredAt: now,
    });
    effects.add(() =>
      emitToGroup(groupId, 'proposal.updated', {
        id: p.id,
        groupId,
        status: 'EXPIRED',
        participation: p.yesCount + p.noCount,
        tally: p.secret ? null : { yes: p.yesCount, no: p.noCount },
      }),
    );
    expired += 1;
  }
  return expired;
}
