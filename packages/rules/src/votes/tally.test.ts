import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { tallyProposal, thresholdCount, validateVote, visibleTally } from './tally';

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
