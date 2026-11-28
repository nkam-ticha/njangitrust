// The `votes.close` scan settles every open proposal that is due. One proposal that cannot be
// settled (a stored payload that no longer parses) must never stop the others from closing: the
// scan runs for every group of the app, and a single bad row would otherwise freeze all votes.
import { describe, expect, it } from 'vitest';
import { getPrisma } from '../../lib/prisma';
import { startedGroup, propose, proposalOf } from '../../../test/helpers/governance';
import { closeDueProposals } from './proposals.tally';

describe('the votes.close scan with a proposal that cannot be settled', () => {
  it('skips it, settles the others and does not throw', async () => {
    const { groupId, admin, members } = await startedGroup(3);
    const everyone = [admin, ...members];

    // A healthy proposal whose time is up.
    const healthy = await propose(admin, groupId, {
      type: 'RULE_CHANGE',
      changes: { lateFine: 700 },
    });
    const past = new Date(Date.now() - 3_600_000);
    await getPrisma().proposal.update({
      where: { id: healthy },
      data: { closesAt: past },
    });

    // A damaged one, also due: its payload is empty, so it cannot be described or settled.
    const broken = await getPrisma().proposal.create({
      data: {
        groupId,
        type: 'FINE_WAIVER',
        payload: {},
        proposerMembershipId: admin.membershipId,
        secret: false,
        thresholdKind: 'MAJORITY',
        eligibleMembershipIds: everyone.map((m) => m.membershipId),
        opensAt: new Date(past.getTime() - 3_600_000),
        closesAt: past,
      },
    });

    await expect(closeDueProposals(new Date())).resolves.toBeGreaterThanOrEqual(1);

    expect((await proposalOf(admin, healthy)).status).not.toBe('OPEN');
    // The damaged one is left as it is, to be looked at, and is not counted as settled.
    const left = await getPrisma().proposal.findUniqueOrThrow({ where: { id: broken.id } });
    expect(left.status).toBe('OPEN');
  });
});
