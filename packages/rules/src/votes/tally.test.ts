import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { closeInstant, tallyProposal, thresholdCount, validateVote, visibleTally } from './tally';

const closesAt = new Date('2026-11-05T08:00:00.000Z');
const before = new Date('2026-11-03T08:00:00.000Z');

describe('thresholds (R11.2)', () => {
  it('E7: 10 eligible need 6 (majority) or 7 (two-thirds); 9 eligible need 5 or 6', () => {
    expect(thresholdCount('MAJORITY', 10)).toBe(6);
    expect(thresholdCount('TWO_THIRDS', 10)).toBe(7);
    expect(thresholdCount('MAJORITY', 9)).toBe(5);
    expect(thresholdCount('TWO_THIRDS', 9)).toBe(6);
  });

  it('match floor(n / 2) + 1 and ceil(2n / 3) for every group size (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), (n) => {
        expect(thresholdCount('MAJORITY', n)).toBe(Math.floor(n / 2) + 1);
        expect(thresholdCount('TWO_THIRDS', n)).toBe(Math.ceil((2 * n) / 3));
      }),
    );
  });
});

describe('tally and early close (R11.2, R11.3)', () => {
  const base = { thresholdKind: 'MAJORITY' as const, eligibleCount: 10, closesAt, now: before };

  it('counts against eligible voters, not votes cast', () => {
    expect(tallyProposal({ ...base, yes: 5, no: 0 })).toEqual({
      status: 'OPEN',
      required: 6,
      remaining: 5,
    });
  });

  it('closes early as passed once the threshold is reached', () => {
    expect(tallyProposal({ ...base, yes: 6, no: 0 })).toEqual({
      status: 'PASSED',
      required: 6,
      remaining: 4,
    });
  });

  it('closes early as rejected once the threshold can no longer be reached', () => {
    expect(tallyProposal({ ...base, yes: 2, no: 5 })).toEqual({
      status: 'REJECTED',
      required: 6,
      remaining: 3,
    });
  });

  it('expires at closesAt when the threshold was not reached', () => {
    expect(tallyProposal({ ...base, yes: 5, no: 1, now: closesAt })).toEqual({
      status: 'EXPIRED',
      required: 6,
      remaining: 4,
    });
  });

  it('ROTATION_CHANGE also needs a yes from every member whose position changes', () => {
    const rotation = { ...base, mustApprove: { required: 2, yes: 1, no: 0 } };
    expect(tallyProposal({ ...rotation, yes: 7, no: 0 })).toMatchObject({ status: 'OPEN' });
    expect(
      tallyProposal({ ...rotation, yes: 7, no: 0, mustApprove: { required: 2, yes: 2, no: 0 } }),
    ).toMatchObject({
      status: 'PASSED',
    });
    expect(
      tallyProposal({ ...rotation, yes: 7, no: 1, mustApprove: { required: 2, yes: 1, no: 1 } }),
    ).toMatchObject({
      status: 'REJECTED',
    });
  });

  it('refuses tallies with more votes than voters', () => {
    expect(() => tallyProposal({ ...base, yes: 8, no: 3 })).toThrow(RangeError);
  });
});

describe('secret votes close as soon as the result is certain (D32)', () => {
  const secret = {
    thresholdKind: 'MAJORITY' as const,
    eligibleCount: 3,
    secret: true,
    closesAt,
    now: before,
  };

  it('passes at once when the threshold is reached, even with a voter still to come', () => {
    expect(tallyProposal({ ...secret, yes: 2, no: 0 })).toEqual({
      status: 'PASSED',
      required: 2,
      remaining: 1,
    });
  });

  it('is rejected at once when the threshold can no longer be reached', () => {
    expect(tallyProposal({ ...secret, yes: 0, no: 2 })).toEqual({
      status: 'REJECTED',
      required: 2,
      remaining: 1,
    });
  });

  it('stays open while the result is still undecided and someone can still vote', () => {
    expect(tallyProposal({ ...secret, yes: 1, no: 0 })).toEqual({
      status: 'OPEN',
      required: 2,
      remaining: 2,
    });
    expect(tallyProposal({ ...secret, eligibleCount: 5, yes: 1, no: 2 })).toMatchObject({
      status: 'OPEN',
      remaining: 2,
    });
  });

  it('passes at once when the last eligible member has voted and yes reaches the threshold', () => {
    expect(tallyProposal({ ...secret, yes: 2, no: 1 })).toEqual({
      status: 'PASSED',
      required: 2,
      remaining: 0,
    });
    expect(tallyProposal({ ...secret, yes: 3, no: 0 })).toMatchObject({ status: 'PASSED' });
  });

  it('is rejected at once when the last eligible member has voted and yes falls short', () => {
    expect(tallyProposal({ ...secret, yes: 1, no: 2 })).toEqual({
      status: 'REJECTED',
      required: 2,
      remaining: 0,
    });
  });

  it('follows the window when the result stays undecided', () => {
    expect(tallyProposal({ ...secret, yes: 1, no: 0, now: closesAt })).toMatchObject({
      status: 'EXPIRED',
      remaining: 2,
    });
    expect(tallyProposal({ ...secret, yes: 2, no: 0, now: closesAt })).toMatchObject({
      status: 'PASSED',
    });
  });

  it('does not change a public vote: it closes as soon as the result is certain', () => {
    expect(tallyProposal({ ...secret, secret: false, yes: 2, no: 0 })).toMatchObject({
      status: 'PASSED',
      remaining: 1,
    });
    expect(tallyProposal({ ...secret, secret: false, eligibleCount: 5, yes: 0, no: 3 })).toEqual({
      status: 'REJECTED',
      required: 3,
      remaining: 2,
    });
  });
});

describe('the time a proposal closes (R11.3, D26)', () => {
  it('a secret vote seen after its deadline closes at the deadline, not when the job ran', () => {
    const late = new Date(closesAt.getTime() + 90_000);
    expect(closeInstant({ secret: true, closesAt, now: late })).toEqual(closesAt);
  });

  it('a secret vote finished early closes now', () => {
    expect(closeInstant({ secret: true, closesAt, now: before })).toEqual(before);
  });

  it('a public vote closes now, early or late', () => {
    const late = new Date(closesAt.getTime() + 90_000);
    expect(closeInstant({ secret: false, closesAt, now: late })).toEqual(late);
    expect(closeInstant({ secret: false, closesAt, now: before })).toEqual(before);
  });
});

describe('casting votes (R11.4) and what is shown (R11.5)', () => {
  const vote = {
    eligibleVoterIds: ['M1', 'M2'],
    voterId: 'M1',
    alreadyVoted: false,
    status: 'OPEN' as const,
    closesAt,
    now: before,
  };

  it('allows one vote per eligible member while the proposal is open', () => {
    expect(validateVote(vote)).toEqual({ ok: true });
    expect(validateVote({ ...vote, alreadyVoted: true })).toEqual({
      ok: false,
      code: 'ALREADY_VOTED',
    });
    expect(validateVote({ ...vote, voterId: 'M9' })).toEqual({
      ok: false,
      code: 'NOT_ELIGIBLE_VOTER',
    });
    expect(validateVote({ ...vote, status: 'PASSED' })).toEqual({
      ok: false,
      code: 'PROPOSAL_CLOSED',
    });
    expect(validateVote({ ...vote, now: closesAt })).toEqual({
      ok: false,
      code: 'PROPOSAL_CLOSED',
    });
  });

  it('shows only participation for an open secret vote, totals after the close', () => {
    expect(visibleTally({ secret: true, status: 'OPEN', yes: 4, no: 2 })).toEqual({ voted: 6 });
    expect(visibleTally({ secret: true, status: 'REJECTED', yes: 4, no: 2 })).toEqual({
      voted: 6,
      yes: 4,
      no: 2,
    });
    expect(visibleTally({ secret: false, status: 'OPEN', yes: 4, no: 2 })).toEqual({
      voted: 6,
      yes: 4,
      no: 2,
    });
  });
});
