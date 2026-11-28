// A member who announced leaving at the end of the cycle (R12.2, FSD MEM-01) leaves when the cycle
// closes. Their share of the general fund (R9.3, D40.5) was already credited; here their loan balance
// becomes due and due debts come out of what the group owes them (D13.4, as for any exit), then the
// membership ends. Contributions still owed to beneficiaries stay owed (R12.3).
import type { Bilingual } from '@njangi/shared';
import { cycleSystemTexts } from '@njangi/shared/i18n/server/cycles';
import type { EffectSink } from '../../lib/after-commit';
import type { Prisma } from '../../lib/prisma';
import { bilingual } from '../../lib/texts';
import { audit } from '../audit';
import { postSystemMessage } from '../chat';
import { appendLedgerEntry } from '../ledger';
import { endMembershipAccess } from '../members/membership-access';
import { settleDueDebts } from '../payouts/payouts.settlement';

type Tx = Prisma.TransactionClient;

export async function endLeavingMember(
  tx: Tx,
  input: {
    groupId: string;
    membershipId: string;
    userId: string;
    name: string;
    cycleId: string;
    now: Date;
    effects: EffectSink;
  },
): Promise<void> {
  const { groupId, membershipId, now } = input;
  // A loan asked or approved and not sent yet stops here: its installments were never owed.
  const unsent = await tx.loan.findMany({
    where: {
      groupId,
      membershipId,
      OR: [
        { status: 'REQUESTED' },
        {
          status: 'APPROVED',
          OR: [{ disbursementId: null }, { disbursement: { status: 'FAILED' } }],
        },
      ],
    },
    select: { id: true, status: true },
  });
  const requested = unsent.filter((loan) => loan.status === 'REQUESTED').map((l) => l.id);
  const approved = unsent.filter((loan) => loan.status === 'APPROVED').map((l) => l.id);
  if (requested.length > 0)
    await tx.loan.updateMany({
      where: { id: { in: requested } },
      data: { status: 'REJECTED', decidedAt: now },
    });
  if (approved.length > 0) {
    await tx.loan.updateMany({ where: { id: { in: approved } }, data: { status: 'EXPIRED' } });
    await tx.obligation.updateMany({
      where: { loanId: { in: approved }, status: 'DUE' },
      data: { status: 'CANCELLED' },
    });
  }
  // D13.4: the rest of a loan already sent is due now.
  const accelerate = await tx.obligation.findMany({
    where: {
      groupId,
      membershipId,
      kind: 'LOAN_INSTALLMENT',
      status: 'DUE',
      dueAt: { gt: now },
      loan: { status: { in: ['DISBURSED', 'OVERDUE'] } },
    },
    select: { id: true },
  });
  if (accelerate.length > 0) {
    await tx.obligation.updateMany({
      where: { id: { in: accelerate.map((row) => row.id) } },
      data: { dueAt: now },
    });
  }
  await settleDueDebts(tx, { groupId, membershipId, now });

  await tx.membership.update({
    where: { id: membershipId },
    data: { status: 'LEFT', leftAt: now },
  });
  await appendLedgerEntry(tx, groupId, {
    type: 'EVENT',
    occurredAt: now.toISOString(),
    roundId: null,
    membershipId,
    refType: 'Cycle',
    refId: input.cycleId,
    descriptionFr: 'Membre parti à la fin du cycle',
    descriptionEn: 'Member left at the end of the cycle',
    metadata: { event: 'MEMBER_LEFT', membershipId, reason: 'CYCLE_END' },
    postings: [],
  });
  endMembershipAccess(input.effects, { userId: input.userId, groupId });
  const text: Bilingual = bilingual(cycleSystemTexts.memberLeft, { name: input.name });
  await postSystemMessage(groupId, text, input.effects, tx);
  await audit(
    {
      action: 'member.left',
      groupId,
      target: `Membership:${membershipId}`,
      details: { reason: 'CYCLE_END' },
      system: true,
    },
    tx,
  );
}
