// Member statements (spec 2.14, FSD STA-01): creation for a month, a cycle or custom dates, figures
// re-derived with the rules package to the franc, the stored PDF, who may read a statement, the
// public verification endpoint and the monthly job.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { statementSchema, verifyResultSchema } from '@njangi/shared/contracts/statements';
import {
  memberReliability,
  memberStatementLines,
  monthPeriod,
  statementData,
  statementTotals,
  statementVerificationCode,
  type ObligationFact,
} from '@njangi/rules';
import { setRateLimitScaleForTests } from '../../http/rate-limit';
import { settleBackground, useJobScheduler } from '../../jobs/dispatch';
import { getPrisma } from '../../lib/prisma';
import { getStorage } from '../../storage';
import { appendLedger, entryOf } from '../../../test/helpers/ledger-seed';
import { stageApp } from '../../../test/helpers/stage-app';
import { stageApi } from '../../../test/helpers/stage-client';
import {
  AT,
  CONTRIBUTION,
  FINE,
  NET_PER_PAYMENT,
  OCTOBER,
  SOLIDARITY,
  statementWorld,
  WITHDRAWAL_FEE,
  type StatementWorld,
} from '../../../test/helpers/statement-world';
import type { TestUser } from '../../../test/helpers/client';
import { generateMonthlyStatement, planMonthlyStatements } from './statements.jobs';
import { statementCard } from './statements.service';

let w: StatementWorld;

beforeAll(async () => {
  stageApp();
  useJobScheduler(null);
  w = await statementWorld();
});

afterAll(async () => {
  await settleBackground();
});

const create = (member: TestUser, period: object = OCTOBER, extra: object = {}) =>
  stageApi(member).post('/v1/me/statements', { groupId: w.groupId, period, ...extra });

async function factsOf(membershipId: string): Promise<ObligationFact[]> {
  const rows = await getPrisma().obligation.findMany({
    where: { membershipId },
    include: { round: { select: { number: true } } },
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

describe('creating a statement (spec 2.14)', () => {
  it('makes the October statement of the beneficiary, with a code tied to the ledger head', async () => {
    const res = await create(w.beneficiary);
    expect(res.status).toBe(201);
    const statement = statementSchema.parse(res.body.statement);
    expect(statement.groupId).toBe(w.groupId);
    expect(statement.groupName).toBe(w.groupName);
    expect(statement.language).toBe('fr');
    expect(statement.period).toEqual(monthPeriod(2026, 10));
    expect(statement.verificationCode).toMatch(/^[0-9a-f]{12}$/);
    expect(statement.verifyAddress).toMatch(
      new RegExp(`^[^/]+/verify/${statement.verificationCode}$`),
    );
    expect(statement.verifyAddress.startsWith('http')).toBe(false);

    const row = await getPrisma().statement.findUniqueOrThrow({ where: { id: statement.id } });
    expect(row.membershipId).toBe(w.beneficiary.membershipId);
    expect(row.ledgerHeadHash).toBe(w.chain.at(-1)!.hash);
    expect(row.fileKey).toMatch(/^statements\/[0-9a-f-]+\/[0-9a-f-]+\.pdf$/);
    const head = await getStorage().readHead(row.fileKey, 5);
    expect(Buffer.from(head!).toString('latin1')).toBe('%PDF-');
    expect((await getStorage().stat(row.fileKey))!.sizeBytes).toBeGreaterThan(1_000);
  });

  it('prints the code the rules package gives for the same ledger, obligations and issue time', async () => {
    const statement = (await create(w.beneficiary)).body.statement;
    const facts = await factsOf(w.beneficiary.membershipId);
    const lines = memberStatementLines({
      membershipId: w.beneficiary.membershipId,
      transactions: w.chain,
      obligations: facts,
      period: statement.period,
    });
    // E1 for four payers: 4 x 9 909 credited, all of it withdrawn (fee 500 on top of the amount).
    expect(statementTotals(lines)).toMatchObject({
      contributions: CONTRIBUTION,
      solidarityContributions: SOLIDARITY,
      payouts: 4 * NET_PER_PAYMENT,
      payoutFeeShares: 4 * 91,
      withdrawals: w.withdrawn,
      fees: WITHDRAWAL_FEE,
      fines: 0,
    });
    const params = (await getPrisma().ruleSet.findFirstOrThrow({ where: { groupId: w.groupId } }))
      .params as { reliabilityWindow: number };
    const data = statementData({
      groupId: w.groupId,
      membershipId: w.beneficiary.membershipId,
      language: 'fr',
      period: statement.period,
      issuedAt: statement.issuedAt,
      lines,
      reliability: memberReliability({
        facts,
        reliabilityWindow: params.reliabilityWindow,
        now: new Date(statement.issuedAt),
      }),
    });
    expect(statement.verificationCode).toBe(statementVerificationCode(data, w.chain.at(-1)!.hash));
  });

  it('returns the statement already issued while the ledger has not changed', async () => {
    const first = (await create(w.carl)).body.statement;
    const again = (await create(w.carl)).body.statement;
    expect(again.id).toBe(first.id);
    expect(again.verificationCode).toBe(first.verificationCode);
    expect(
      await getPrisma().statement.count({ where: { membershipId: w.carl.membershipId } }),
    ).toBe(1);
  });

  it('writes it in the language asked for, as a statement of its own', async () => {
    const french = (await create(w.bea)).body.statement;
    const english = (await create(w.bea, OCTOBER, { language: 'en' })).body.statement;
    expect(english.language).toBe('en');
    expect(english.id).not.toBe(french.id);
    expect(english.verificationCode).not.toBe(french.verificationCode);
  });

  it('covers a cycle and custom dates', async () => {
    const cycle = await create(w.dina, { kind: 'CYCLE' });
    expect(cycle.status).toBe(201);
    expect(cycle.body.statement.period.start).toBe(AT.draw);
    const numbered = await create(w.dina, { kind: 'CYCLE', number: 1 });
    expect(numbered.body.statement.id).toBe(cycle.body.statement.id);
    const custom = await create(w.dina, { kind: 'CUSTOM', from: '2026-10-10', to: '2026-10-20' });
    expect(custom.status).toBe(201);
    // Both days included, in Douala time (UTC+1).
    expect(custom.body.statement.period).toEqual({
      start: '2026-10-09T23:00:00.000Z',
      end: '2026-10-20T23:00:00.000Z',
    });
  });

  it.each([
    [
      'a month that has not started',
      { kind: 'MONTH', year: 2031, month: 1 },
      400,
      'PERIOD_IN_THE_FUTURE',
    ],
    [
      'dates in the wrong order',
      { kind: 'CUSTOM', from: '2026-10-20', to: '2026-10-10' },
      400,
      'PERIOD_ENDS_BEFORE_START',
    ],
    [
      'a day that does not exist',
      { kind: 'CUSTOM', from: '2026-02-31', to: '2026-03-02' },
      400,
      'PERIOD_INVALID',
    ],
    [
      'more than three years',
      { kind: 'CUSTOM', from: '2021-01-01', to: '2026-10-10' },
      400,
      'PERIOD_TOO_LONG',
    ],
    ['a cycle that does not exist', { kind: 'CYCLE', number: 9 }, 404, 'CYCLE_NOT_FOUND'],
  ])('refuses %s with a bilingual error', async (_name, period, status, code) => {
    const res = await create(w.bea, period);
    expect(res.status).toBe(status);
    expect(res.body.code).toBe(code);
    expect(res.body.messageFr).toBeTruthy();
    expect(res.body.messageEn).toBeTruthy();
  });

  it('refuses a malformed period before reaching the service', async () => {
    const res = await create(w.bea, { kind: 'MONTH', year: 2026, month: 13 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });
});

describe('who may read a statement (spec 2.11)', () => {
  it('lets a member who left ask for their own statement, but not a stranger or a guest', async () => {
    expect((await create(w.leaver)).status).toBe(201);
    expect((await create(w.stranger)).status).toBeGreaterThanOrEqual(403);
    const guest = await stageApi(null).post('/v1/me/statements', {
      groupId: w.groupId,
      period: OCTOBER,
    });
    expect(guest.status).toBe(401);
  });

  it('lists only my own statements, newest first, and filters by group', async () => {
    const mine = await stageApi(w.bea).get(`/v1/me/statements?groupId=${w.groupId}`);
    expect(mine.status).toBe(200);
    expect(mine.body.statements).toHaveLength(2);
    const ids = new Set(mine.body.statements.map((s: { id: string }) => s.id));
    const others = await getPrisma().statement.findMany({
      where: { membershipId: { not: w.bea.membershipId } },
      select: { id: true },
    });
    expect(others.some((o) => ids.has(o.id))).toBe(false);
    const all = await stageApi(w.bea).get('/v1/me/statements');
    expect(all.body.statements).toHaveLength(2);
    expect((await stageApi(w.stranger).get('/v1/me/statements')).body.statements).toEqual([]);
    const foreign = await stageApi(w.stranger).get(`/v1/me/statements?groupId=${w.groupId}`);
    expect(foreign.status).toBeGreaterThanOrEqual(403);
  });

  it('gives the owner a signed URL valid 5 minutes and tells anyone else the statement is not found', async () => {
    const statement = (await create(w.bea)).body.statement;
    const own = await stageApi(w.bea).get(`/v1/me/statements/${statement.id}`);
    expect(own.status).toBe(200);
    expect(own.body.statement.id).toBe(statement.id);
    expect(own.body.url).toContain('.pdf');
    const ttl = new Date(own.body.expiresAt).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(4 * 60_000);
    expect(ttl).toBeLessThanOrEqual(5 * 60_000);
    expect(JSON.stringify(own.body)).not.toContain('ledgerHeadHash');

    for (const other of [w.carl, w.admin, w.stranger]) {
      const res = await stageApi(other).get(`/v1/me/statements/${statement.id}`);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('STATEMENT_NOT_FOUND');
    }
  });

  it('gives the agent tool a card that carries only the statement id', async () => {
    const card = await statementCard(w.carl.id, { groupId: w.groupId, period: OCTOBER });
    const row = await getPrisma().statement.findFirstOrThrow({
      where: { membershipId: w.carl.membershipId },
    });
    expect(card).toEqual({ type: 'STATEMENT', statementId: row.id });
  });
});

describe('GET /v1/verify/:code (spec 2.14)', () => {
  it('tells anyone that a real code is genuine, with the period and the issue date only', async () => {
    const statement = (await create(w.beneficiary)).body.statement;
    const res = await stageApi(null).get(`/v1/verify/${statement.verificationCode}`);
    expect(res.status).toBe(200);
    expect(verifyResultSchema.parse(res.body)).toEqual({
      genuine: true,
      period: statement.period,
      issuedAt: statement.issuedAt,
    });
    expect(Object.keys(res.body).sort()).toEqual(['genuine', 'issuedAt', 'period']);
    const text = JSON.stringify(res.body);
    for (const secret of [w.groupName, w.beneficiary.name, w.groupId, w.beneficiary.membershipId]) {
      expect(text).not.toContain(secret);
    }
    const upper = await stageApi(null).get(
      `/v1/verify/${statement.verificationCode.toUpperCase()}`,
    );
    expect(upper.body.genuine).toBe(true);
  });

  it.each([
    ['an unknown code', '0123456789ab'],
    ['something that is not a code', 'not-a-code'],
  ])('answers that %s is not genuine, and nothing else', async (_name, code) => {
    const res = await stageApi(null).get(`/v1/verify/${code}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ genuine: false });
  });

  it('limits how many codes one address may try', async () => {
    setRateLimitScaleForTests(1);
    try {
      let last = 200;
      for (let i = 0; i < 31; i++) {
        last = (await stageApi(null).get('/v1/verify/0123456789ab')).status;
      }
      expect(last).toBe(429);
    } finally {
      setRateLimitScaleForTests(1_000);
    }
  });
});

describe('a statement follows the ledger', () => {
  it('issues a new statement with a new code once the ledger has a new entry', async () => {
    const before = (await create(w.lateMember)).body.statement;
    const lines = memberStatementLines({
      membershipId: w.lateMember.membershipId,
      transactions: w.chain,
      obligations: await factsOf(w.lateMember.membershipId),
      period: before.period,
    });
    expect(statementTotals(lines).fines).toBe(FINE);
    expect(lines.find((l) => l.category === 'contributions')).toMatchObject({
      onTime: false,
      roundNumber: 1,
      amount: CONTRIBUTION,
    });
    await appendLedger(w.groupId, [
      entryOf('EVENT', [], { metadata: { event: 'NOTE' }, occurredAt: '2026-11-02T08:00:00.000Z' }),
    ]);
    const after = (await create(w.lateMember)).body.statement;
    expect(after.id).not.toBe(before.id);
    expect(after.verificationCode).not.toBe(before.verificationCode);
    // The earlier statement stays genuine.
    expect((await stageApi(null).get(`/v1/verify/${before.verificationCode}`)).body.genuine).toBe(
      true,
    );
  });
});

describe('statements.monthly (spec 2.9)', () => {
  it('plans one job per current member, with ids only', async () => {
    const planned: { name: string; data: Record<string, unknown>; jobId: string }[] = [];
    useJobScheduler((name, data, _at, jobId) => {
      planned.push({ name, data, jobId });
      return Promise.resolve();
    });
    try {
      await planMonthlyStatements(new Date('2026-11-01T06:00:00.000Z'));
    } finally {
      useJobScheduler(null);
    }
    const ours = planned.filter((p) =>
      [w.admin, w.bea, w.carl, w.dina].some((m) => m.membershipId === p.data.membershipId),
    );
    expect(ours).toHaveLength(4);
    expect(ours.every((p) => p.name === 'statements.generate')).toBe(true);
    expect(Object.keys(ours[0]!.data).sort()).toEqual(['membershipId', 'month', 'year']);
    expect(ours[0]!.data).toMatchObject({ year: 2026, month: 10 });
    expect(ours[0]!.jobId).toBe(`statement-${String(ours[0]!.data.membershipId)}-2026-10`);
    const skipped = [w.leaver, w.newcomer].map((m) => m.membershipId);
    expect(planned.some((p) => skipped.includes(String(p.data.membershipId)))).toBe(false);
  });

  it('makes the statement, tells the member once, and does nothing when run again', async () => {
    const payload = { membershipId: w.admin.membershipId, year: 2026, month: 9 };
    expect(await generateMonthlyStatement(payload)).toBe(true);
    expect(await generateMonthlyStatement(payload)).toBe(false);
    await settleBackground();
    const told = await getPrisma().notification.findMany({
      where: { userId: w.admin.id, deepLink: `/groups/${w.groupId}/statements` },
    });
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({ category: 'MONEY', groupId: w.groupId });
    expect(told[0]!.bodyFr).toContain('septembre 2026');
    expect(told[0]!.bodyEn).toContain('September 2026');
    // The admin has other statements from the tests above: look for September's, exactly one.
    const rows = await getPrisma().statement.findMany({
      where: {
        membershipId: w.admin.membershipId,
        periodStart: new Date(monthPeriod(2026, 9).start),
      },
    });
    expect(rows).toHaveLength(1);
  });
});
