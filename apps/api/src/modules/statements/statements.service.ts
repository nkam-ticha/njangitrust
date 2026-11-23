// Member statements (spec 2.14, FSD STA-01): a PDF per member for a month, a cycle or custom dates,
// in the member's language. The lines, the totals, the reliability score and the verification code
// all come from the rules package; this service reads the ledger and the obligations, stores the
// file and keeps the Statement row. Nothing is held in memory between requests.
import type { Lang } from '@njangi/shared';
import type { AgentCard } from '@njangi/shared/contracts/agent';
import type {
  CreateStatementRequest,
  StatementDto,
  VerifyResult,
} from '@njangi/shared/contracts/statements';
import {
  isStatementCodeFormat,
  memberReliability,
  memberStatementLines,
  statementData,
  statementVerificationCode,
  type ObligationFact,
} from '@njangi/rules';
import { getEnv } from '../../config/env';
import { clock } from '../../lib/clock';
import { newId } from '../../lib/crypto';
import { componentLogger } from '../../lib/logger';
import { getPrisma, type Db } from '../../lib/prisma';
import { authorizeGroup } from '../../permissions';
import { toStatement, toVerifyResult, type StatementSource } from '../../dto/statements';
import { DOWNLOAD_URL_TTL_SECONDS, getStorage } from '../../storage';
import { putObject } from '../media';
import { getCurrentParams } from '../rulesets';
import { headHashOf, readChain } from './ledger-read';
import { statementDocument } from './statements.document';
import { statementError } from './statements.errors';
import { renderStatementPdf } from './statements.pdf';
import { resolvePeriod, type ResolvedPeriod } from './statements.period';

const log = componentLogger('statements');

const withGroup = { membership: { select: { groupId: true, group: { select: { name: true } } } } };

/** The host printed on statements, without the scheme (D9): the app's origin, else the API's. */
export function verifyHost(): string {
  const env = getEnv();
  return (env.PUBLIC_APP_URL ?? env.PUBLIC_BASE_URL)
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
}

async function obligationFacts(db: Db, membershipId: string): Promise<ObligationFact[]> {
  const rows = await db.obligation.findMany({
    where: { membershipId },
    include: { round: { select: { number: true } } },
    orderBy: { dueAt: 'asc' },
  });
  return rows.map((o) => ({
    id: o.id,
    membershipId: o.membershipId,
    kind: o.kind,
    amount: o.amount,
    roundId: o.roundId,
    roundNumber: o.round?.number ?? null,
    dueAt: o.dueAt.toISOString(),
    status: o.status,
    paidAt: o.paidAt?.toISOString() ?? null,
    onTime: o.onTime,
  }));
}

export interface IssueInput {
  membershipId: string;
  groupId: string;
  groupName: string;
  memberName: string;
  language: Lang;
  resolved: ResolvedPeriod;
  now: Date;
}

/**
 * Creates the statement if needed: the same member, period and language on an unchanged ledger gives
 * the statement already issued. Otherwise the PDF is stored first and the row written after; a row
 * that cannot be written removes its file.
 */
export async function issueStatement(
  input: IssueInput,
): Promise<{ statement: StatementSource; created: boolean }> {
  const prisma = getPrisma();
  const { period } = input.resolved;
  const chain = await readChain(prisma, input.groupId);
  const ledgerHeadHash = headHashOf(input.groupId, chain);
  const existing = await prisma.statement.findFirst({
    where: {
      membershipId: input.membershipId,
      periodStart: new Date(period.start),
      periodEnd: new Date(period.end),
      language: input.language,
      ledgerHeadHash,
    },
    orderBy: { createdAt: 'desc' },
    include: withGroup,
  });
  if (existing) return { statement: existing, created: false };

  const facts = await obligationFacts(prisma, input.membershipId);
  const params = await getCurrentParams(input.groupId, prisma);
  const data = statementData({
    groupId: input.groupId,
    membershipId: input.membershipId,
    language: input.language,
    period,
    issuedAt: input.now.toISOString(),
    lines: memberStatementLines({
      membershipId: input.membershipId,
      transactions: chain,
      obligations: facts,
      period,
    }),
    reliability: memberReliability({
      facts,
      reliabilityWindow: params.reliabilityWindow,
      now: input.now,
    }),
  });
  const verificationCode = statementVerificationCode(data, ledgerHeadHash);
  const pdf = await renderStatementPdf(
    statementDocument(data, {
      groupName: input.groupName,
      memberName: input.memberName,
      periodLabel: input.resolved.label[input.language],
      verificationCode,
      verifyAddress: `${verifyHost()}/verify/${verificationCode}`,
    }),
    input.now,
  );
  const fileKey = `statements/${input.membershipId}/${newId()}.pdf`;
  await putObject(fileKey, pdf, 'application/pdf');
  try {
    const statement = await prisma.statement.create({
      data: {
        createdAt: input.now,
        membershipId: input.membershipId,
        periodStart: new Date(period.start),
        periodEnd: new Date(period.end),
        language: input.language,
        fileKey,
        verificationCode,
        ledgerHeadHash,
      },
      include: withGroup,
    });
    return { statement, created: true };
  } catch (error) {
    await getStorage()
      .remove(fileKey)
      .catch((cause: unknown) => log.warn({ err: cause }, 'statement file not removed'));
    throw error;
  }
}

/** POST /me/statements: the caller's own statement in one group (anyone who ever was a member). */
export async function createStatement(
  userId: string,
  request: CreateStatementRequest,
): Promise<StatementDto> {
  const access = await authorizeGroup(userId, request.groupId, 'group.statements.own');
  const prisma = getPrisma();
  const now = clock.now();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true, language: true },
  });
  const resolved = await resolvePeriod(prisma, request.groupId, request.period, now);
  const { statement } = await issueStatement({
    membershipId: access.membership.id,
    groupId: access.group.id,
    groupName: access.group.name,
    memberName: user.name,
    language: request.language ?? user.language,
    resolved,
    now,
  });
  return toStatement(statement, verifyHost());
}

/** GET /me/statements: the caller's statements, newest first, in one group or in all of them. */
export async function listStatements(userId: string, groupId?: string): Promise<StatementDto[]> {
  if (groupId) await authorizeGroup(userId, groupId, 'group.statements.own');
  const rows = await getPrisma().statement.findMany({
    // D28: statements of a group a developer closed and hid are not listed.
    where: {
      membership: { userId, ...(groupId ? { groupId } : {}), group: { hiddenByDeveloperAt: null } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: withGroup,
  });
  const host = verifyHost();
  return rows.map((s) => toStatement(s, host));
}

/** GET /me/statements/:id: the caller's statement and a signed URL of its PDF, valid 5 minutes. */
export async function getStatementDownload(
  userId: string,
  statementId: string,
): Promise<{ statement: StatementDto; url: string; expiresAt: string }> {
  const row = await getPrisma().statement.findUnique({
    where: { id: statementId },
    include: {
      membership: { select: { userId: true, groupId: true, group: { select: { name: true } } } },
    },
  });
  // Someone else's statement answers exactly like one that does not exist.
  if (!row || row.membership.userId !== userId) throw statementError('STATEMENT_NOT_FOUND');
  await authorizeGroup(userId, row.membership.groupId, 'group.statements.own');
  const signed = await getStorage().createDownloadUrl({
    key: row.fileKey,
    expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
  });
  return {
    statement: toStatement(row, verifyHost()),
    url: signed.url,
    expiresAt: signed.expiresAt.toISOString(),
  };
}

/**
 * GET /verify/:code, for anyone (2.14): whether a statement with this code was issued, its period and
 * its issue date. Anything that is not a code, or is unknown, is simply not genuine.
 */
export async function verifyStatement(code: string): Promise<VerifyResult> {
  const normalized = code.trim().toLowerCase();
  if (!isStatementCodeFormat(normalized)) return toVerifyResult(null);
  const row = await getPrisma().statement.findUnique({
    where: { verificationCode: normalized },
    select: { createdAt: true, periodStart: true, periodEnd: true },
  });
  return toVerifyResult(row);
}

/**
 * The information card of the agent's `get_statement` tool (spec 4.5): creates the statement if
 * needed and returns only its id. The app draws the card from GET /me/statements/:id, so no amount
 * and no file address passes through the model.
 */
export async function statementCard(
  userId: string,
  request: CreateStatementRequest,
): Promise<Extract<AgentCard, { type: 'STATEMENT' }>> {
  const statement = await createStatement(userId, request);
  return { type: 'STATEMENT', statementId: statement.id };
}
