// What the model may read about members, proposals and the solidarity fund (spec 2.11, 4.4, 4.6):
// allowlists built on top of the API's own DTOs, in the member's language, with amounts and dates
// already written. Secret ballots: never who voted what (the source DTO cannot even carry it); in
// the group chat, not even the member's own vote.
import { formatDateTime, formatXAF, type Lang } from '@njangi/shared';
import type { AgentChannel } from '@njangi/shared/contracts/agent';
import type { AdminMemberDto, PublicMemberDto } from '@njangi/shared/contracts/groups';
import type { ProposalDto } from '@njangi/shared/contracts/proposals';
import type { SolidarityRequestItem } from '@njangi/shared/contracts/solidarity';

const ROLE: Record<Lang, Record<string, string>> = {
  fr: { ADMIN: 'admin', MEMBER: 'membre' },
  en: { ADMIN: 'admin', MEMBER: 'member' },
};
const STATUS: Record<Lang, Record<string, string>> = {
  fr: {
    INVITED: 'actif au prochain cycle',
    ACTIVE: 'actif',
    LEAVING: 'part en fin de cycle',
    LEFT: 'parti',
    REMOVED: 'exclu',
    OPEN: 'ouvert',
    PASSED: 'adopté',
    REJECTED: 'rejeté',
    EXPIRED: 'expiré',
  },
  en: {
    INVITED: 'active from next cycle',
    ACTIVE: 'active',
    LEAVING: 'leaving at cycle end',
    LEFT: 'left',
    REMOVED: 'removed',
    OPEN: 'open',
    PASSED: 'passed',
    REJECTED: 'rejected',
    EXPIRED: 'expired',
  },
};

export function toAgentMember(member: PublicMemberDto | AdminMemberDto, lang: Lang) {
  return {
    name: member.name,
    role: ROLE[lang][member.role],
    status: STATUS[lang][member.status],
    ...(member.isMe ? { isYou: true } : {}),
  };
}

const CHOICE: Record<Lang, Record<'YES' | 'NO' | 'VOTED', string>> = {
  fr: { YES: 'oui', NO: 'non', VOTED: 'a voté (vote secret)' },
  en: { YES: 'yes', NO: 'no', VOTED: 'voted (secret vote)' },
};

export function toAgentProposal(p: ProposalDto, lang: Lang, channel: AgentChannel) {
  const open = p.status === 'OPEN';
  return {
    id: p.id,
    title: p.title[lang],
    type: p.type,
    status: STATUS[lang][p.status],
    secret: p.secret,
    proposer: p.proposer.name,
    ...(p.reason ? { reason: p.reason } : {}),
    threshold:
      lang === 'fr'
        ? `${p.requiredYes} oui sur ${p.eligibleCount} membres`
        : `${p.requiredYes} yes of ${p.eligibleCount} members`,
    participation: p.participation,
    // R11.5: a secret vote shows only participation until it closes.
    ...(p.tally ? { yes: p.tally.yes, no: p.tally.no } : {}),
    ...(!p.secret && p.votes
      ? { votes: p.votes.map((v) => ({ member: v.member.name, choice: CHOICE[lang][v.choice] })) }
      : {}),
    ...(p.mustApprove.length ? { mustApprove: p.mustApprove.map((m) => m.name) } : {}),
    [open ? 'closesAt' : 'closedAt']: formatDateTime(p.closedAt ?? p.closesAt, lang),
    ...(p.effect ? { effect: p.effect[lang] } : {}),
    // Spec 4.6: the member's own vote only in the private conversation.
    ...(channel === 'PRIVATE'
      ? { myVote: p.myVote ? CHOICE[lang][p.myVote] : null, canVote: p.canVote }
      : {}),
  };
}

const EVENT: Record<Lang, Record<SolidarityRequestItem['event'], string>> = {
  fr: {
    DEUIL: 'deuil',
    NAISSANCE: 'naissance',
    MALADIE: 'maladie',
    MARIAGE: 'mariage',
    AUTRE: 'autre',
  },
  en: {
    DEUIL: 'bereavement',
    NAISSANCE: 'birth',
    MALADIE: 'illness',
    MARIAGE: 'wedding',
    AUTRE: 'other',
  },
};

export function toAgentSolidarity(
  fundBalance: number | null,
  requests: SolidarityRequestItem[],
  lang: Lang,
) {
  return {
    fundBalance: fundBalance === null ? null : formatXAF(fundBalance, lang),
    requests: requests.slice(0, 20).map((r) => ({
      recipient: r.recipient.name,
      requestedBy: r.requester.name,
      event: EVENT[lang][r.event],
      amount: formatXAF(r.amount, lang),
      status: r.status,
      ...(r.note ? { note: r.note } : {}),
      ...(r.proposalId ? { proposalId: r.proposalId } : {}),
      createdAt: formatDateTime(r.createdAt, lang),
    })),
  };
}
