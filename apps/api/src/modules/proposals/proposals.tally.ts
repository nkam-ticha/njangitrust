// Closing proposals (R11.2, R11.3, R11.8, FSD GOV-02, GOV-04). Runs as the system, in its own
// transaction, never inside the voter's transaction: from the `votes.close` job, or right after a
// vote (`settleAfterVote`), so the result shows at once. Every proposal, a secret one
// (MEMBER_REMOVE, ADMIN_CHANGE) included, closes as soon as its result is certain (D32); a secret
// one that is still undecided at `closesAt` closes as of that instant, so the result's time cannot
// be matched to a voter (D20.1, privacy-guard H1, M1, M-A).
import { closeInstant, tallyProposal } from '@njangi/rules';
import { proposalTexts } from '@njangi/shared/i18n/server/proposals';
import { AfterCommit } from '../../lib/after-commit';
import { clock } from '../../lib/clock';
import { componentLogger } from '../../lib/logger';
import { runAsSystem } from '../../lib/request-context';
import { dispatchJob } from '../../jobs/dispatch';
import { getPrisma, type Prisma, type Proposal } from '../../lib/prisma';
import { ui } from '../../lib/texts';
import { lockGroup } from '../../permissions';
import { emitToGroup } from '../../realtime/emitter';
import { audit } from '../audit';
import { postSystemMessage } from '../chat';
import { createNotifications } from '../notifications';
import { ledgerEventsPort } from './governance-ports';
import { activeMembers, memberNames } from './proposals.context';
import { noticeBody } from './proposals.notices';
import { proposalDefinition } from './types';

type Status = 'OPEN' | 'PASSED' | 'REJECTED' | 'EXPIRED';

const log = componentLogger('proposals');

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

/**
 * Re-tallies one proposal and, if its result is certain, closes and applies it. A secret proposal
 * that is still undecided at `closesAt` closes as of that instant (D20.1, D32).
 */
export async function settleProposal(proposalId: string, now: Date = clock.now()): Promise<Status> {
  const effects = new AfterCommit();
  const status = await getPrisma().$transaction(
    async (tx) => {
      // Lock order: Group, then Proposal (D28: a developer's closing takes them in this order, and
      // the ledger entry below takes the group lock exclusively anyway).
      const owner = await tx.proposal.findUnique({
        where: { id: proposalId },
        select: { groupId: true },
      });
      if (owner) await lockGroup(tx, owner.groupId, 'update');
      await tx.$queryRaw`SELECT "id" FROM "Proposal" WHERE "id" = ${proposalId}::uuid FOR UPDATE`;
      const p = await tx.proposal.findUniqueOrThrow({ where: { id: proposalId } });
      if (p.status !== 'OPEN') return p.status;
      const at = closeInstant({ secret: p.secret, closesAt: p.closesAt, now });
      const tally = tallyProposal({
        secret: p.secret,
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

/**
 * After a vote is committed: settles the proposal at once, as the system, so the result is on
 * every member's screen before the voter's confirmation returns (GOV-02, D26). It never waits for
 * the job queue, which on a serverless host only runs at the next cron tick. If settling fails, the
 * `votes.close` job tries again.
 */
export async function settleAfterVote(proposalId: string, participation: number): Promise<void> {
  try {
    await runAsSystem(() => settleProposal(proposalId));
  } catch (error) {
    log.error({ err: error }, 'closing a proposal after a vote failed; retrying in a job');
    await dispatchJob(
      'votes.close',
      { proposalId },
      { jobId: `tally-${proposalId}-${participation}` },
    );
  }
}

/**
 * Job `votes.close` scan: every open proposal past its closing time (R11.3), and every open
 * proposal whose result is already certain, in case the request that took the deciding vote was
 * cut off before it could close the proposal (D32).
 */
export async function closeDueProposals(now: Date = clock.now()): Promise<number> {
  const open = await getPrisma().proposal.findMany({
    where: { status: 'OPEN' },
    select: {
      id: true,
      secret: true,
      thresholdKind: true,
      eligibleMembershipIds: true,
      mustApproveMembershipIds: true,
      yesCount: true,
      noCount: true,
      closesAt: true,
    },
    // The oldest deadlines first, so a long list never leaves the longest-waiting vote behind.
    orderBy: { closesAt: 'asc' },
    take: 200,
  });
  let settled = 0;
  for (const p of open) {
    const due = p.closesAt <= now;
    const certain =
      p.mustApproveMembershipIds.length === 0 &&
      tallyProposal({
        secret: p.secret,
        thresholdKind: p.thresholdKind,
        eligibleCount: p.eligibleMembershipIds.length,
        yes: p.yesCount,
        no: p.noCount,
        closesAt: p.closesAt,
        now,
      }).status !== 'OPEN';
    if (!due && !certain) continue;
    // One proposal that cannot be settled (a stored payload that no longer parses, say) must not
    // freeze every other vote of the app: log it by id and carry on. It stays open to be looked at.
    try {
      await settleProposal(p.id, now);
      settled += 1;
    } catch (error) {
      log.error(
        { proposalId: p.id, errorName: error instanceof Error ? error.name : 'unknown' },
        'a proposal could not be settled, the others go on',
      );
    }
  }
  return settled;
}
