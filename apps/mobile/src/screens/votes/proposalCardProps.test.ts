// Why a member does not vote, and what an open or closed card shows (R11.4, R11.5).
import { describe, expect, it } from 'vitest';
import type { ProposalDto } from '@njangi/shared/contracts/proposals';
import type { TFunction } from 'i18next';
import { notEligibleReason, proposalCardProps } from './proposalCardProps';

const base = {
  id: 'p',
  groupId: 'g',
  type: 'MEMBER_REMOVE',
  status: 'OPEN',
  secret: true,
  canVote: false,
  myVote: null,
  subject: { type: 'MEMBER_REMOVE', member: { membershipId: 'me', name: 'Moi' } },
} as unknown as ProposalDto;

describe('notEligibleReason', () => {
  it('tells the target of a removal that the vote is about them', () => {
    expect(notEligibleReason(base, 'me')).toBe('excludedTarget');
  });

  it('is a plain "you do not vote" for anyone else who cannot vote', () => {
    expect(notEligibleReason(base, 'someone')).toBe('notEligible');
  });

  it('is nothing when the member can vote, has voted, or the vote is closed', () => {
    expect(notEligibleReason({ ...base, canVote: true }, 'me')).toBeNull();
    expect(notEligibleReason({ ...base, myVote: 'VOTED' }, 'me')).toBeNull();
    expect(notEligibleReason({ ...base, status: 'PASSED' }, 'me')).toBeNull();
  });

  it('names the early-exit requester and the borrowing admin', () => {
    const exit = {
      ...base,
      type: 'EARLY_EXIT',
      subject: { type: 'EARLY_EXIT', member: { membershipId: 'me', name: 'Moi' } },
    } as unknown as ProposalDto;
    const loan = {
      ...base,
      type: 'ADMIN_LOAN',
      subject: {
        type: 'ADMIN_LOAN',
        member: { membershipId: 'me', name: 'Moi' },
        amount: 1,
        months: 1,
      },
    } as unknown as ProposalDto;
    expect(notEligibleReason(exit, 'me')).toBe('excludedProposer');
    expect(notEligibleReason(loan, 'me')).toBe('excludedAdmin');
  });
});

describe('the time left on an open vote', () => {
  const open = {
    ...base,
    proposer: { membershipId: 'x', name: 'X' },
    title: { fr: 'T', en: 'T' },
    closesAt: '2026-11-20T09:34:40.971Z',
    tally: null,
    participation: 3,
    eligibleCount: 3,
    requiredYes: 2,
  } as unknown as ProposalDto;
  const t = ((key: string, o?: { count?: number }) =>
    `${key}:${o?.count ?? ''}`) as unknown as TFunction;
  const card = (now: number) =>
    proposalCardProps(open, { lang: 'fr', t, now, myMembershipId: 'me' });

  it('counts the hours while the deadline is ahead', () => {
    const props = card(new Date('2026-11-20T04:00:00Z').getTime());
    expect(props.timeLeft).toBe('time.duration.hours:6');
    expect(props.closing).toBeUndefined();
  });

  it('says it is closing, never "1 hour left", once the deadline has passed', () => {
    const props = card(new Date('2026-11-23T14:00:00Z').getTime());
    expect(props.closing).toBe(true);
    expect(props.timeLeft).toBeUndefined();
  });
});
