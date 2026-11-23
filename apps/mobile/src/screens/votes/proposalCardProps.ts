// ProposalDto → ProposalCard props (DESIGN_SYSTEM.md 5.20). Totals stay null for an open secret
// vote (R11.5); the card then shows participation only.
import type { TFunction } from 'i18next';
import { pick, type Lang } from '@njangi/shared';
import type { ProposalDto } from '@njangi/shared/contracts/proposals';
import type { NotEligibleReason, ProposalCardProps } from '@/ui';

/** "2 jours" / "5 heures" until the vote closes. */
export function timeLeft(closesAt: string, now: number, t: TFunction): string {
  const hours = Math.max(1, Math.ceil((new Date(closesAt).getTime() - now) / 3_600_000));
  return hours >= 48
    ? t('time.duration.days', { count: Math.round(hours / 24) })
    : t('time.duration.hours', { count: hours });
}

/** Why the member does not vote on an open proposal, in the words the card has for it. */
export function notEligibleReason(
  p: ProposalDto,
  myMembershipId: string | null,
): NotEligibleReason | null {
  if (p.status !== 'OPEN' || p.canVote || p.myVote) return null;
  const s = p.subject;
  const aboutMe = 'member' in s && s.member.membershipId === myMembershipId;
  if (aboutMe && (s.type === 'MEMBER_REMOVE' || s.type === 'FINE_WAIVER')) return 'excludedTarget';
  if (aboutMe && s.type === 'EARLY_EXIT') return 'excludedProposer';
  if (aboutMe && s.type === 'ADMIN_LOAN') return 'excludedAdmin';
  return 'notEligible';
}

export function proposalCardProps(
  p: ProposalDto,
  ctx: { lang: Lang; t: TFunction; now: number; myMembershipId: string | null },
): Omit<ProposalCardProps, 'onYes' | 'onNo' | 'onOpen' | 'offline'> {
  const open = p.status === 'OPEN';
  return {
    type: p.type,
    title: pick(p.title, ctx.lang),
    proposerName: p.proposer.name,
    proposedByMe: p.proposer.membershipId === ctx.myMembershipId,
    secret: p.secret,
    status: p.status,
    eligible: p.eligibleCount,
    needed: p.requiredYes,
    yes: p.tally?.yes ?? null,
    no: p.tally?.no ?? null,
    voted: p.participation,
    // Past its deadline a vote is being closed: never "1 hour left" (the hour count has a floor).
    ...(open && new Date(p.closesAt).getTime() <= ctx.now
      ? { closing: true }
      : { timeLeft: open ? timeLeft(p.closesAt, ctx.now, ctx.t) : undefined }),
    myVote:
      p.myVote === 'YES'
        ? 'yes'
        : p.myVote === 'NO'
          ? 'no'
          : p.myVote === 'VOTED'
            ? 'secret'
            : 'none',
    notEligible: notEligibleReason(p, ctx.myMembershipId),
    effect: p.effect ? pick(p.effect, ctx.lang) : undefined,
  };
}
