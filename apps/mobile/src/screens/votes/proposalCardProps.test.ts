// Why a member does not vote, and what an open or closed card shows (R11.4, R11.5).
import { describe, expect, it } from 'vitest';
import type { ProposalDto } from '@njangi/shared/contracts/proposals';
import { notEligibleReason } from './proposalCardProps';

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
