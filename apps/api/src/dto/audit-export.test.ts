import { describe, expect, it } from 'vitest';
import { toExportProposal } from './audit-export';

const base = {
  id: '00000000-0000-4000-8000-000000000001',
  type: 'MEMBER_REMOVE',
  thresholdKind: 'MAJORITY',
  eligibleMembershipIds: ['a', 'b', 'c'],
  yesCount: 2,
  noCount: 1,
  opensAt: new Date('2026-10-05T08:00:00.000Z'),
  closesAt: new Date('2026-10-08T08:00:00.000Z'),
  appliedAt: null,
} as const;

describe('the audit export of proposals (R11.5, D20)', () => {
  it('hides the running count of an open secret vote and its ballots', () => {
    const open = toExportProposal({ ...base, secret: true, status: 'OPEN' } as never, [
      { membershipId: 'a', choice: 'YES' },
    ]);
    expect(open.yesCount).toBe(0);
    expect(open.noCount).toBe(0);
    expect(open.ballots).toBeNull();
  });

  it('gives the totals of a secret vote once it is closed, and still no ballots', () => {
    const closed = toExportProposal({ ...base, secret: true, status: 'PASSED' } as never, []);
    expect([closed.yesCount, closed.noCount]).toEqual([2, 1]);
    expect(closed.ballots).toBeNull();
  });
});
