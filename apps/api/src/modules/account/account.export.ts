// Export of my personal data (spec Part 7, FSD PRV-03, D34). Reads only rows that belong to the
// caller (by user id or by the caller's memberships) and hands them to the allowlist mapper
// `toDataExport`. It adds nothing up: every amount is a stored whole-FCFA figure as it is.
import type { DataExport } from '@njangi/shared/contracts/account';
import { parseAccount, payableAccount, receivableAccount } from '@njangi/rules';
import { toDataExport, toNotificationPrefs, type DataExportSource } from '../../dto';
import { clock } from '../../lib/clock';
import { commonError } from '../../lib/errors';
import { getPrisma } from '../../lib/prisma';
import { audit } from '../audit';
import { reliabilityOfMembership } from '../me';
import { getNotificationPrefs } from '../notifications';

/** A member who has been in the app for years still gets everything; this only bounds a runaway. */
const MAX_ROWS = 5_000;

type Source = DataExportSource;

/**
 * Ledger entries that name the member: the entries recorded about them and every entry with a posting
 * on their payable or receivable account. Only the postings on the member's own accounts are kept.
 * The hashes, the descriptions and the metadata (which can name other members) stay out.
 */
async function ledgerEntriesOf(membershipIds: string[]): Promise<Source['ledgerEntries']> {
  const accounts = new Set(
    membershipIds.flatMap((id) => [payableAccount(id), receivableAccount(id)]),
  );
  const rows = await getPrisma().ledgerTransaction.findMany({
    where: {
      OR: [
        { membershipId: { in: membershipIds } },
        { postings: { some: { account: { in: [...accounts] } } } },
      ],
    },
    orderBy: [{ groupId: 'asc' }, { seq: 'asc' }],
    take: MAX_ROWS,
    select: {
      groupId: true,
      seq: true,
      type: true,
      occurredAt: true,
      postings: { orderBy: { id: 'asc' }, select: { account: true, amount: true } },
    },
  });
  return rows.map(({ postings, ...entry }) => ({
    ...entry,
    postings: postings.flatMap((p) => {
      const kind = accounts.has(p.account) ? parseAccount(p.account)?.kind : undefined;
      return kind === 'PAYABLE' || kind === 'RECEIVABLE'
        ? [{ account: kind, amount: p.amount }]
        : [];
    }),
  }));
}

/** Reads everything the member's export holds. */
export async function loadDataExport(userId: string): Promise<Source> {
  const prisma = getPrisma();
  const now = clock.now();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      loginPhone: true,
      language: true,
      createdAt: true,
      consentVersion: true,
      consentAt: true,
      deletedAt: true,
    },
  });
  if (!user || user.deletedAt) throw commonError('UNAUTHENTICATED');

  const memberships = await prisma.membership.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      role: true,
      status: true,
      createdAt: true,
      leftAt: true,
      group: { select: { id: true, name: true } },
    },
  });
  const ids = memberships.map((m) => m.id);
  const mine = { membershipId: { in: ids } };
  const take = MAX_ROWS;

  const [
    paymentNumbers,
    reliabilities,
    obligations,
    payments,
    withdrawals,
    loans,
    bids,
    receipts,
    ballots,
    ledgerEntries,
    chatMessages,
    conversations,
    prefs,
    devices,
    statements,
  ] = await Promise.all([
    prisma.paymentNumber.findMany({
      where: { userId },
      orderBy: { activeFrom: 'asc' },
      select: { number: true, operator: true, activeFrom: true, activeTo: true },
    }),
    Promise.all(memberships.map((m) => reliabilityOfMembership(m.group.id, m.id, prisma, now))),
    prisma.obligation.findMany({
      where: mine,
      orderBy: { dueAt: 'asc' },
      take,
      select: {
        groupId: true,
        kind: true,
        amount: true,
        dueAt: true,
        status: true,
        paidAt: true,
        onTime: true,
        round: { select: { number: true } },
      },
    }),
    prisma.paymentIntent.findMany({
      where: mine,
      orderBy: { createdAt: 'asc' },
      take,
      select: {
        groupId: true,
        amount: true,
        fee: true,
        status: true,
        createdAt: true,
        settledAt: true,
      },
    }),
    prisma.disbursement.findMany({
      where: mine,
      orderBy: { createdAt: 'asc' },
      take,
      select: {
        groupId: true,
        purpose: true,
        amount: true,
        feeActual: true,
        feeEstimated: true,
        status: true,
        createdAt: true,
        settledAt: true,
      },
    }),
    prisma.loan.findMany({
      where: mine,
      orderBy: { createdAt: 'asc' },
      take,
      select: {
        groupId: true,
        principal: true,
        months: true,
        ratePermille: true,
        interest: true,
        totalDue: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.bid.findMany({
      where: mine,
      orderBy: { placedAt: 'asc' },
      take,
      select: { amount: true, placedAt: true, round: { select: { groupId: true, number: true } } },
    }),
    prisma.voteReceipt.findMany({
      where: mine,
      orderBy: { votedAt: 'asc' },
      take,
      select: {
        proposalId: true,
        votedAt: true,
        proposal: { select: { groupId: true, type: true, secret: true } },
      },
    }),
    // Choices exist only for votes by show of hands; the database refuses a ballot for a secret one.
    prisma.ballot.findMany({
      where: { ...mine, proposal: { secret: false } },
      take,
      select: { proposalId: true, choice: true },
    }),
    ledgerEntriesOf(ids),
    // What I wrote and still exists (D33 deletes messages after 90 days); not what I deleted.
    prisma.message.findMany({
      where: {
        authorMembershipId: { in: ids },
        deletedAt: null,
        kind: { notIn: ['SYSTEM', 'AGENT'] },
      },
      orderBy: { createdAt: 'asc' },
      take,
      select: { groupId: true, kind: true, text: true, createdAt: true },
    }),
    // Only my private conversations with the assistant: the group channel's replies are the group's.
    prisma.agentConversation.findMany({
      where: { userId, channel: 'PRIVATE' },
      orderBy: { createdAt: 'asc' },
      select: {
        groupId: true,
        messages: {
          where: { role: { in: ['user', 'assistant'] } },
          orderBy: { createdAt: 'asc' },
          take,
          select: { role: true, content: true, createdAt: true },
        },
      },
    }),
    getNotificationPrefs(userId),
    prisma.device.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, platform: true, expoPushToken: true, lastSeenAt: true },
    }),
    prisma.statement.findMany({
      where: mine,
      orderBy: { createdAt: 'asc' },
      take,
      select: {
        id: true,
        periodStart: true,
        periodEnd: true,
        language: true,
        createdAt: true,
        verificationCode: true,
        membership: { select: { groupId: true } },
      },
    }),
  ]);

  const choiceOf = new Map(ballots.map((b) => [b.proposalId, b.choice]));
  return {
    generatedAt: now,
    user: {
      id: user.id,
      name: user.name,
      loginPhone: user.loginPhone,
      language: user.language,
      createdAt: user.createdAt,
      consentVersion: user.consentVersion,
      consentAt: user.consentAt,
    },
    paymentNumbers,
    memberships: memberships.map((m, i) => ({
      groupId: m.group.id,
      groupName: m.group.name,
      role: m.role,
      status: m.status,
      createdAt: m.createdAt,
      leftAt: m.leftAt,
      reliability: reliabilities[i]!,
    })),
    obligations: obligations.map(({ round, ...o }) => ({
      ...o,
      roundNumber: round?.number ?? null,
    })),
    payments,
    withdrawals: withdrawals.map((d) => ({
      groupId: d.groupId,
      purpose: d.purpose,
      amount: d.amount,
      fee: d.feeActual ?? d.feeEstimated,
      status: d.status,
      createdAt: d.createdAt,
      settledAt: d.settledAt,
    })),
    loans,
    bids: bids.map((b) => ({
      groupId: b.round.groupId,
      roundNumber: b.round.number,
      amount: b.amount,
      placedAt: b.placedAt,
    })),
    votes: receipts.map((r) => ({
      groupId: r.proposal.groupId,
      proposalType: r.proposal.type,
      secret: r.proposal.secret,
      choice: r.proposal.secret ? null : (choiceOf.get(r.proposalId) ?? null),
      votedAt: r.votedAt,
    })),
    ledgerEntries,
    chatMessages,
    assistantConversations: conversations
      .map((c) => ({
        groupId: c.groupId,
        messages: c.messages.flatMap((m) =>
          m.role === 'tool' ? [] : [{ role: m.role, content: m.content, createdAt: m.createdAt }],
        ),
      }))
      .filter((c) => c.messages.length > 0),
    notificationSettings: toNotificationPrefs(prefs),
    devices,
    statements: statements.map(({ membership, ...s }) => ({ ...s, groupId: membership.groupId })),
  };
}

/** GET /v1/me/data-export: the member's own data as one document; the audit line carries counts only. */
export async function exportMyData(userId: string): Promise<DataExport> {
  const source = await loadDataExport(userId);
  const document = toDataExport(source);
  await audit({
    action: 'account.data.exported',
    actorUserId: userId,
    target: `User:${userId}`,
    details: {
      groups: document.groups.length,
      obligations: document.obligations.length,
      payments: document.payments.length,
      withdrawals: document.withdrawals.length,
      loans: document.loans.length,
      votes: document.votes.length,
      ledgerEntries: document.ledgerEntries.length,
      chatMessages: document.chatMessages.length,
      conversations: document.assistantConversations.length,
      statements: document.statements.length,
    },
  });
  return document;
}
