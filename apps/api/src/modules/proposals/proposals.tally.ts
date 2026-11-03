// Closing a proposal once its result is certain (R11.2, R11.3, R11.8). Thresholds and outcomes
// come from @njangi/rules. Phase 0 applies MEMBER_ADD (the admin may then invite); Phase 5 adds
// the other effects and the EVENT ledger entry for every result.
import { tallyProposal } from '@njangi/rules';
import type { EffectSink } from '../../lib/after-commit';
import type { Prisma } from '../../lib/prisma';
import { bilingual, ui } from '../../lib/texts';
import { proposalTexts } from '@njangi/shared/i18n/server/proposals';
import { emitToGroup } from '../../realtime/emitter';
import { audit } from '../audit';
import { postSystemMessage } from '../chat';
import { readMemberAddPayload, titleOf } from './proposals.payloads';

/** Re-tallies a proposal inside `tx` (row locked by the caller) and closes it if decided. */
export async function settleProposal(
  tx: Prisma.TransactionClient,
  proposalId: string,
  now: Date,
  effects: EffectSink,
): Promise<'OPEN' | 'PASSED' | 'REJECTED' | 'EXPIRED'> {
  const p = await tx.proposal.findUniqueOrThrow({ where: { id: proposalId } });
  if (p.status !== 'OPEN') return p.status;
  const tally = tallyProposal({
    thresholdKind: p.thresholdKind,
    eligibleCount: p.eligibleMembershipIds.length,
    yes: p.yesCount,
    no: p.noCount,
    closesAt: p.closesAt,
    now,
  });
  if (tally.status === 'OPEN') {
    effects.add(() =>
      emitToGroup(p.groupId, 'proposal.updated', {
        id: p.id,
        groupId: p.groupId,
        status: 'OPEN',
        participation: p.yesCount + p.noCount,
        tally: p.secret ? null : { yes: p.yesCount, no: p.noCount },
      }),
    );
    return 'OPEN';
  }
  const passed = tally.status === 'PASSED';
  const effect =
    passed && p.type === 'MEMBER_ADD'
      ? bilingual(proposalTexts.effectInviteAllowed, { name: readMemberAddPayload(p.payload).inviteeName })
      : null;
  await tx.proposal.update({
    where: { id: p.id },
    data: { status: tally.status, closedAt: now, ...(passed ? { appliedAt: now } : {}), ...(effect ? { effect } : {}) },
  });
  const counts = { title: titleOf(p.type, p.payload), yes: p.yesCount, no: p.noCount };
  const message =
    tally.status === 'PASSED'
      ? ui((c) => c.chat.system.votePassed, counts)
      : tally.status === 'REJECTED'
        ? ui((c) => c.chat.system.voteRejected, counts)
        : ui((c) => c.chat.system.voteExpired, { title: counts.title });
  await postSystemMessage(p.groupId, message, effects, tx);
  await audit({ action: `proposal.${tally.status.toLowerCase()}`, groupId: p.groupId, target: `Proposal:${p.id}`, details: { yes: p.yesCount, no: p.noCount } }, tx);
  effects.add(() =>
    emitToGroup(p.groupId, 'proposal.updated', {
      id: p.id,
      groupId: p.groupId,
      status: tally.status,
      participation: p.yesCount + p.noCount,
      tally: { yes: p.yesCount, no: p.noCount },
    }),
  );
  return tally.status;
}
