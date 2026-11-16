// The audit export (spec 2.14, FSD LED-04): any member downloads the group's whole ledger as JSON or
// CSV: transactions, postings, hashes, rule set versions, draw seeds and proposals with their tallies.
// It is built field by field from allowlist mappers and read-only queries, in the format the rules
// package verifies (`verifyLedgerExport`, tools/verify-ledger). Phone numbers leave only masked and a
// secret vote leaves only as counters.
import type { AgentCard } from '@njangi/shared/contracts/agent';
import { statementErrorTexts as t } from '@njangi/shared/i18n/server/statements';
import {
  computeBalances,
  LEDGER_EXPORT_FORMAT,
  LEDGER_EXPORT_VERSION,
  verifyLedgerExport,
  type LedgerExport,
} from '@njangi/rules';
import { clock } from '../../lib/clock';
import { defineErrors } from '../../lib/errors';
import { componentLogger } from '../../lib/logger';
import { getPrisma } from '../../lib/prisma';
import { authorizeGroup } from '../../permissions';
import {
  toExportCycle,
  toExportMember,
  toExportProposal,
  toExportRuleSet,
} from '../../dto/audit-export';
import { consumeOrThrow, lazyLimiter } from '../../http/rate-limit';
import { readChain } from '../statements';
import { ledgerExportToCsv } from './ledger-csv';

const log = componentLogger('audit-export');

export const exportError = defineErrors({
  EXPORT_NOT_AVAILABLE: { status: 503, text: t.EXPORT_NOT_AVAILABLE },
});

/** The export reads the whole ledger: 20 downloads an hour per member is plenty. */
const exportLimiter = lazyLimiter(
  { name: 'ledger-export-user', points: 20, durationSeconds: 3600 },
  { scaled: true },
);

/** The group's ledger export, for a member allowed to read the ledger. */
export async function buildLedgerExport(userId: string, groupId: string): Promise<LedgerExport> {
  const access = await authorizeGroup(userId, groupId, 'group.ledger.export');
  await consumeOrThrow(exportLimiter, userId);
  const prisma = getPrisma();
  const [members, ruleSets, cycles, proposals, openBallots, transactions] = await Promise.all([
    prisma.membership.findMany({
      where: { groupId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        status: true,
        user: {
          select: {
            name: true,
            paymentNumbers: {
              where: { activeTo: null },
              orderBy: { activeFrom: 'desc' },
              take: 1,
              select: { number: true },
            },
          },
        },
      },
    }),
    prisma.ruleSet.findMany({ where: { groupId }, orderBy: { version: 'asc' } }),
    prisma.cycle.findMany({ where: { groupId }, orderBy: { number: 'asc' } }),
    prisma.proposal.findMany({ where: { groupId }, orderBy: { opensAt: 'asc' } }),
    // R11.5: the ballots of secret proposals are never read here.
    prisma.ballot.findMany({
      where: { proposal: { groupId, secret: false } },
      orderBy: { castAt: 'asc' },
      select: { proposalId: true, membershipId: true, choice: true },
    }),
    readChain(prisma, groupId),
  ]);
  const head = transactions.at(-1);
  const balances = computeBalances(transactions);
  const file: LedgerExport = {
    format: LEDGER_EXPORT_FORMAT,
    version: LEDGER_EXPORT_VERSION,
    exportedAt: clock.now().toISOString(),
    group: { id: access.group.id, name: access.group.name },
    members: members.map(toExportMember),
    ruleSets: ruleSets.map(toExportRuleSet),
    cycles: cycles.flatMap((c) =>
      c.startedAt ? [toExportCycle({ ...c, startedAt: c.startedAt })] : [],
    ),
    proposals: proposals.map((p) =>
      toExportProposal(
        p,
        openBallots.filter((b) => b.proposalId === p.id),
      ),
    ),
    transactions,
    head: head ? { seq: head.seq, hash: head.hash } : null,
    balances: Object.fromEntries([...balances].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
  };
  // Last line of defence (2.11): hashed ledger text is never rewritten, so a file in which a phone
  // number shows anywhere is not sent at all. Only the places are logged, never the digits.
  const leaks = verifyLedgerExport(file).problems.filter((p) => p.code === 'UNMASKED_PHONE_NUMBER');
  if (leaks.length > 0) {
    log.error({ groupId, places: leaks.map((p) => p.detail) }, 'ledger export withheld');
    throw exportError('EXPORT_NOT_AVAILABLE');
  }
  return file;
}

/** The same export as CSV text (one row per posting, see ledger-csv.ts). */
export async function buildLedgerCsv(userId: string, groupId: string): Promise<string> {
  return ledgerExportToCsv(await buildLedgerExport(userId, groupId));
}

/**
 * The information card of the agent's `export_ledger` tool (spec 4.5): after the permission check it
 * returns only what the app needs to offer the download; no ledger data passes through the model.
 */
export async function ledgerExportCard(
  userId: string,
  groupId: string,
  format: 'json' | 'csv',
): Promise<Extract<AgentCard, { type: 'LEDGER_EXPORT' }>> {
  await authorizeGroup(userId, groupId, 'group.ledger.export');
  return { type: 'LEDGER_EXPORT', groupId, format };
}
