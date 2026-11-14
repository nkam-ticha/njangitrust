// Jobs `votes.close` and `votes.remind` (spec 2.9). Both run as the system. Each proposal also gets
// one delayed job at its own time; the repeatable scans catch anything a restart missed.
import { voteReminderAt } from '@njangi/rules';
import { formatDateTime } from '@njangi/shared';
import { proposalTexts } from '@njangi/shared/i18n/server/proposals';
import type { Job } from 'bullmq';
import { AfterCommit } from '../../lib/after-commit';
import { clock } from '../../lib/clock';
import { getPrisma } from '../../lib/prisma';
import { ui } from '../../lib/texts';
import { registerJob, registerRepeatable } from '../../jobs/registry';
import { createNotifications } from '../notifications';
import { activeMembers, memberNames } from './proposals.context';
import { closeDueProposals, settleProposal } from './proposals.tally';
import { noticeBody } from './proposals.notices';
import { proposalDefinition } from './types';

/** Reminds eligible members who haven't voted, 24 hours before the close (spec 2.9). */
export async function remindVoters(proposalId: string, now: Date = clock.now()): Promise<number> {
  const prisma = getPrisma();
  const effects = new AfterCommit();
  const count = await prisma.$transaction(async (tx) => {
    const claimed = await tx.proposal.updateMany({
      where: { id: proposalId, status: 'OPEN', remindedAt: null, closesAt: { gt: now } },
      data: { remindedAt: now },
    });
    if (claimed.count !== 1) return 0;
    const p = await tx.proposal.findUniqueOrThrow({ where: { id: proposalId } });
    const voted = new Set(
      (
        await tx.voteReceipt.findMany({ where: { proposalId }, select: { membershipId: true } })
      ).map((r) => r.membershipId),
    );
    const members = (await activeMembers(tx, p.groupId)).filter(
      (m) => p.eligibleMembershipIds.includes(m.id) && !voted.has(m.id),
    );
    const definition = proposalDefinition(p.type);
    const title = definition.describe(
      definition.payload.parse(p.payload),
      await memberNames(tx, p.groupId),
    ).title;
    const group = await tx.group.findUniqueOrThrow({
      where: { id: p.groupId },
      select: { name: true },
    });
    const body = noticeBody(
      p.type,
      'reminder',
      group,
      ui((c) => c.notificationPrefill.voteReminder, {
        title,
        date: { fr: formatDateTime(p.closesAt, 'fr'), en: formatDateTime(p.closesAt, 'en') },
      }),
    );
    await createNotifications(
      members.map((m) => ({
        userId: m.userId,
        groupId: p.groupId,
        category: 'VOTES' as const,
        title: proposalTexts.reminderTitle,
        body,
        deepLink: `/votes/${p.id}`,
      })),
      effects,
      tx,
    );
    return members.length;
  });
  await effects.run();
  return count;
}

/** Scan: open proposals whose reminder time has passed and that weren't reminded. */
export async function remindDueVoters(now: Date = clock.now()): Promise<number> {
  const open = await getPrisma().proposal.findMany({
    where: { status: 'OPEN', remindedAt: null, closesAt: { gt: now } },
    select: { id: true, opensAt: true, closesAt: true },
    take: 500,
  });
  let reminded = 0;
  for (const p of open) {
    const at = voteReminderAt(p.closesAt);
    if (at <= now && at > p.opensAt) reminded += await remindVoters(p.id, now);
  }
  return reminded;
}

type ProposalJob = Job<{ proposalId?: string }>;

export function registerProposalJobs(): void {
  // H1: these jobs return nothing and leave no finished job behind (ids, times, results).
  registerJob({
    name: 'votes.close',
    keepNoHistory: true,
    process: async (job: ProposalJob) => {
      if (job.data.proposalId) await settleProposal(job.data.proposalId);
      else await closeDueProposals();
    },
  });
  registerRepeatable({ id: 'votes.close.scan', name: 'votes.close', pattern: '*/5 * * * *' });
  registerJob({
    name: 'votes.remind',
    keepNoHistory: true,
    process: async (job: ProposalJob) => {
      if (job.data.proposalId) await remindVoters(job.data.proposalId);
      else await remindDueVoters();
    },
  });
  registerRepeatable({ id: 'votes.remind.scan', name: 'votes.remind', pattern: '7 * * * *' });
}
