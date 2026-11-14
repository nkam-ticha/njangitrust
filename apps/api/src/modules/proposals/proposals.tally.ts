// Closing proposals (R11.2, R11.3, R11.8, FSD GOV-02, GOV-04). Runs only in the `votes.close` job,
// as the system, in its own transaction: never inside a voter's request. A secret proposal
// (MEMBER_REMOVE, ADMIN_CHANGE) never closes early and is closed as of its `closesAt`, so neither
// the result's time nor its records can be matched to a voter (D20.1, privacy-guard H1, M1, M-A).
import { tallyProposal } from '@njangi/rules';
import { proposalTexts } from '@njangi/shared/i18n/server/proposals';
import { AfterCommit } from '../../lib/after-commit';
import { clock } from '../../lib/clock';
import { getPrisma, type Prisma, type Proposal } from '../../lib/prisma';
import { ui } from '../../lib/texts';
import { emitToGroup } from '../../realtime/emitter';
import { audit } from '../audit';
import { postSystemMessage } from '../chat';
import { createNotifications } from '../notifications';
import { ledgerEventsPort } from './governance-ports';
import { activeMembers, memberNames } from './proposals.context';
import { noticeBody } from './proposals.notices';
import { proposalDefinition } from './types';

type Status = 'OPEN' | 'PASSED' | 'REJECTED' | 'EXPIRED';

/** ROTATION_CHANGE: how the members whose turn moves voted (non-secret, so from the ballots). */
async function mustApproveTally(tx: Prisma.TransactionClient, p: Proposal) {
  if (p.mustApproveMembershipIds.length === 0) return undefined;
  const ballots = await tx.ballot.findMany({
    where: { proposalId: p.id, membershipId: { in: p.mustApproveMembershipIds } },
    select: { choice: true },
  });
  return {
    required: p.mustApproveMembershipIds.length,
    yes: ballots.filter((b) => b.choice === 'YES').length,
    no: ballots.filter((b) => b.choice === 'NO').length,
  };
}

function announce(p: Proposal, status: Status) {
  const open = status === 'OPEN';
  emitToGroup(p.groupId, 'proposal.updated', {
    id: p.id,
    groupId: p.groupId,
    status,
    participation: p.yesCount + p.noCount,
    tally: open && p.secret ? null : { yes: p.yesCount, no: p.noCount },
  });
}

/** `proposal.updated` while a secret vote is open: participation only (R11.5, D20.1). */
export function announceParticipation(p: Proposal, participation: number): void {
  emitToGroup(p.groupId, 'proposal.updated', {
    id: p.id,
    groupId: p.groupId,
    status: 'OPEN',
    participation,
    tally: null,
  });
}

/**
 * Re-tallies one proposal and, if its result is certain, closes and applies it. A secret proposal
 * stays open until `closesAt` whatever the counts, then closes as of that instant.
 */
export async function settleProposal(proposalId: string, now: Date = clock.now()): Promise<Status> {
  const effects = new AfterCommit();
  const status = await getPrisma().$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Proposal" WHERE "id" = ${proposalId}::uuid FOR UPDATE`;
      const p = await tx.proposal.findUniqueOrThrow({ where: { id: proposalId } });
      if (p.status !== 'OPEN') return p.status;
      if (p.secret && now < p.closesAt) return 'OPEN';
      const at = p.secret ? p.closesAt : now;
      const tally = tallyProposal({
        thresholdKind: p.thresholdKind,
        eligibleCount: p.eligibleMembershipIds.length,
        yes: p.yesCount,
        no: p.noCount,
        mustApprove: await mustApproveTally(tx, p),
        closesAt: p.closesAt,
        now: at,
      });
      if (tally.status === 'OPEN') {
        effects.add(() => announce(p, 'OPEN'));
        return 'OPEN';
      }
      const group = await tx.group.findUniqueOrThrow({
        where: { id: p.groupId },
        select: { id: true, name: true },
      });
      const names = await memberNames(tx, p.groupId);
      const definition = proposalDefinition(p.type);
      const payload = definition.payload.parse(p.payload);
      const title = definition.describe(payload, names).title;
      const ctx = { tx, proposal: p, now: at, effects, group, names };
      const effect = tally.status === 'PASSED' ? await definition.apply(ctx, payload) : null;
      if (tally.status !== 'PASSED') await definition.onNotPassed?.(ctx, payload);
      await tx.proposal.update({
        where: { id: p.id },
        data: {
          status: tally.status,
          closedAt: at,
          ...(tally.status === 'PASSED' ? { appliedAt: at } : {}),
          ...(effect ? { effect: { fr: effect.fr, en: effect.en } } : {}),
        },
      });
      const counts = { title, yes: p.yesCount, no: p.noCount };
      const message =
        tally.status === 'PASSED'
          ? ui((c) => c.chat.system.votePassed, counts)
          : tally.status === 'REJECTED'
            ? ui((c) => c.chat.system.voteRejected, counts)
            : ui((c) => c.chat.system.voteExpired, { title });
      await postSystemMessage(p.groupId, message, effects, tx);
      // R11.8: the result in the hash chain. No member id: it would tie a secret vote to someone.
      await ledgerEventsPort().appendEvent(tx, {
        groupId: p.groupId,
        event: {
          event: 'VOTE_CLOSED',
          proposalId: p.id,
          proposalType: p.type,
          status: tally.status,
          yes: p.yesCount,
          no: p.noCount,
          eligible: p.eligibleMembershipIds.length,
        },
        description: message,
        refType: 'Proposal',
        refId: p.id,
        occurredAt: at,
      });
      const members = await activeMembers(tx, p.groupId);
      await createNotifications(
        members.map((m) => ({
          userId: m.userId,
          groupId: p.groupId,
          category: 'VOTES' as const,
          title: proposalTexts.resultTitle,
          body: noticeBody(p.type, 'result', group, message),
          deepLink: `/votes/${p.id}`,
        })),
        effects,
        tx,
      );
      await audit(
        {
          action: `proposal.${tally.status.toLowerCase()}`,
          system: true,
          groupId: p.groupId,
          target: `Proposal:${p.id}`,
        },
        tx,
      );
      const closed = { ...p, status: tally.status };
      effects.add(() => announce(closed, tally.status));
      return tally.status;
    },
    { timeout: 20_000 },
  );
  await effects.run();
  return status;
}

/** Job `votes.close` scan: every open proposal past its closing time (R11.3). */
export async function closeDueProposals(now: Date = clock.now()): Promise<number> {
  const due = await getPrisma().proposal.findMany({
    where: { status: 'OPEN', closesAt: { lte: now } },
    select: { id: true },
    take: 200,
  });
  for (const { id } of due) await settleProposal(id, now);
  return due.length;
}
