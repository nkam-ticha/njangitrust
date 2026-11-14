// Privacy-guard L-1 (R11.5): a pending secret vote is stored sealed, and the sealed size never
// depends on the choice, whatever the proposal title. Uses the real VOTE_CAST cards.
import { describe, expect, it } from 'vitest';
import { getPrisma } from '../../lib/prisma';
import { storedFields } from '../pending-actions/pending-actions.storage';
import {
  addMember,
  createGroup,
  markFirstCycleStarted,
  signUp,
} from '../../../test/helpers/factories';
import { voteCastHandler } from './votes.actions';

describe('sealed secret-vote cards (L-1)', () => {
  it('seal to one size for yes and no, over every title length', async () => {
    const admin = await signUp();
    const { groupId, adminMembershipId } = await createGroup(admin);
    const carine = await addMember(admin, groupId);
    const target = await addMember(admin, groupId);
    await markFirstCycleStarted(groupId);
    const now = new Date();
    const proposal = await getPrisma().proposal.create({
      data: {
        groupId,
        type: 'MEMBER_REMOVE',
        payload: { membershipId: target.membershipId },
        proposerMembershipId: adminMembershipId,
        subjectMembershipId: target.membershipId,
        secret: true,
        thresholdKind: 'MAJORITY',
        eligibleMembershipIds: [adminMembershipId, carine.membershipId],
        opensAt: now,
        closesAt: new Date(now.getTime() + 72 * 3_600_000),
      },
    });
    const ctx = {
      userId: carine.id,
      groupId,
      lang: 'fr' as const,
      origin: 'UI' as const,
      now,
      db: getPrisma(),
    };
    const previews = new Set<number>();
    const args = new Set<number>();
    // Names from 2 to 60 characters, some of them two bytes long, so titles cross many sizes.
    for (let length = 2; length <= 60; length += 1) {
      const name = 'Aé'.repeat(length).slice(0, length);
      await getPrisma().user.update({ where: { id: target.id }, data: { name } });
      for (const choice of ['YES', 'NO'] as const) {
        const input = { proposalId: proposal.id, choice, secret: true };
        const preview = await voteCastHandler.prepare(ctx, input);
        const stored = storedFields(voteCastHandler, input, preview) as {
          args: { sealed: string };
          preview: { sealed: string };
        };
        previews.add(stored.preview.sealed.length);
        args.add(stored.args.sealed.length);
      }
    }
    expect(previews.size).toBe(1);
    expect(args.size).toBe(1);
  });
});
