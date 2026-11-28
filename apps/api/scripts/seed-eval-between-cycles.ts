// Builds, on the evaluation database ONLY (njangitrust_eval), one group that is BETWEEN CYCLES, so the
// end-of-cycle Caisse screens (CycleEndCard, BetweenCyclesPanel, StartNextCycleSheet) can be walked
// through in a browser. Run from apps/api:
//   tsx --env-file=.env scripts/seed-eval-between-cycles.ts
//
// Everything goes through the real services (HTTP routes in process, the pending-action cards, the
// mock payment provider, the payout and close services), with EXPLICIT dates: the process clock is
// frozen and walked forward from about seven months ago to the last payout, so no demo clock file is
// read or written and nothing waits in real time. Each run creates a NEW group and new throwaway
// accounts; other groups and the development database are never touched.
//
// Cases in the group (6 members, 5 take part in cycle 1):
//   - DEBTOR   skips one contribution after being served: a fine and a debt, so no share;
//   - LEAVER   announced "leave at the end of the cycle": gets a share, then becomes LEFT;
//   - NEWCOMER added by a real passed MEMBER_ADD vote during the cycle: INVITED, no share;
//   - ADMIN and two other members: equal shares; the remainder (kept in the fund) is non-zero.
import { createServer } from 'node:net';
import type { CycleCloseMember } from '@njangi/rules';
import type { TestUser } from '../test/helpers/client';

// ---------------------------------------------------------------------------------------------
// 1. Refuse to run on any database but njangitrust_eval. Nothing below prints a URL or a secret.
// ---------------------------------------------------------------------------------------------
const evalUrl = process.env.EVAL_DATABASE_URL;
if (!evalUrl) throw new Error('EVAL_DATABASE_URL is required (it is loaded from apps/api/.env)');
const target = new URL(evalUrl);
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
  throw new Error('EVAL_DATABASE_URL must point to a local database');
}
if (target.pathname.replace(/^\//, '') !== 'njangitrust_eval') {
  throw new Error('EVAL_DATABASE_URL must target njangitrust_eval');
}
// The API's own modules read DATABASE_URL: point it at the evaluation database for this process.
// NODE_ENV=test only unlocks the frozen clock (src/lib/clock.ts); the demo clock file stays unread.
process.env.DATABASE_URL = evalUrl;
process.env.NODE_ENV = 'test';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.LOG_LEVEL = 'silent';
for (const key of [
  'OPENROUTER_API_KEY',
  'OPENROUTER_API_KEYS',
  'OPENROUTER_MODEL',
  'GROQ_API_KEY',
  'GROQ_API_KEYS',
  'GROQ_MODEL',
  'GOOGLE_AI_API_KEY',
  'GOOGLE_AI_API_KEYS',
  'GOOGLE_AI_MODEL',
]) {
  process.env[key] = '';
}

// Modules that read the environment are imported only now, after it is set.
const { setTestClock, clock } = await import('../src/lib/clock');
const { getPrisma, disconnectPrisma } = await import('../src/lib/prisma');
const { settleBackground } = await import('../src/jobs/dispatch');
const { closeCycle, openRound } = await import('../src/modules/cycles');
const { openPayout } = await import('../src/modules/payouts');
const { assessRoundFines } = await import('../src/modules/fines/fines.service');
const { pollPaymentIntent } = await import('../src/modules/payments');
const { MOCK_CONFIRMATION_MS } = await import('../src/modules/providers/mock-provider');
const { readChain } = await import('../src/modules/statements/ledger-read');
const { api } = await import('../test/helpers/client');
const { appendLedger, entryOf } = await import('../test/helpers/ledger-seed');
const { propose, vote, proposalOf, closeAtDeadline } = await import('../test/helpers/governance');
const factories = await import('../test/helpers/factories');
const rules = await import('@njangi/rules');

type Member = TestUser & { membershipId: string };
type AuthBody = Parameters<typeof factories.toTestUser>[0];

// Shapes of the JSON bodies this script reads (supertest types them as `any`).
interface LoginBody {
  session: { accessToken: string };
}
interface DuesBody {
  dues: { id: string; roundNumber: number | null }[];
}
interface CardBody {
  action: { id: string };
}
interface ConfirmBody {
  action: { result: { ref: string } };
}
interface AcceptBody extends AuthBody {
  me: { membershipId: string };
}

/** The response body as the type this script expects from that route. */
function bodyOf<T>(res: { body: unknown }): T {
  return res.body as T;
}

/** A person who accepted an invite, from the accept response. */
function memberOf(res: { body: unknown }): Member {
  const body = bodyOf<AcceptBody>(res);
  return { ...factories.toTestUser(body), membershipId: body.me.membershipId };
}

async function proposalStatus(admin: Member, proposalId: string): Promise<string> {
  const proposal = (await proposalOf(await relogin(admin), proposalId)) as { status: string };
  return proposal.status;
}

const prisma = getPrisma();
const DAY = 86_400_000;

function fail(message: string): never {
  throw new Error(message);
}

function goTo(at: Date): void {
  if (at.getTime() > clock.now().getTime()) setTestClock(at);
}

/** Signs the member in again at the current (frozen) instant: sessions do not survive the jumps. */
async function relogin(member: Member): Promise<Member> {
  const res = await api(null, { ownPhones: [member.phone, member.paymentNumber] }).post(
    '/v1/auth/login',
    { phone: member.phone, pin: member.pin },
  );
  if (res.status !== 200) fail(`login failed for ${member.name}: ${res.status}`);
  return { ...member, accessToken: bodyOf<LoginBody>(res).session.accessToken };
}

async function confirmAs(member: Member, actionId: string) {
  const fresh = await relogin(member);
  const res = await factories.confirm(fresh, actionId);
  if (res.status !== 200) fail(`confirm failed for ${member.name}: ${res.status}`);
  return res;
}

/** Pays everything the member owes for one round; the mock operator confirms it. */
async function payRound(groupId: string, who: Member, roundNumber: number): Promise<void> {
  const member = await relogin(who);
  const dues = await api(member).get(`/v1/groups/${groupId}/me/dues`);
  const ids = bodyOf<DuesBody>(dues)
    .dues.filter((due) => due.roundNumber === roundNumber)
    .map((due) => due.id);
  if (ids.length === 0) fail(`nothing to pay for ${who.name} in round ${roundNumber}`);
  const card = await api(member).post(`/v1/groups/${groupId}/payments`, { obligationIds: ids });
  if (card.status !== 201) fail(`payment card refused: ${card.status}`);
  const done = await factories.confirm(member, bodyOf<CardBody>(card).action.id);
  if (done.status !== 200) fail(`payment not confirmed: ${done.status}`);
  goTo(new Date(clock.now().getTime() + MOCK_CONFIRMATION_MS + 1_000));
  await pollPaymentIntent(bodyOf<ConfirmBody>(done).action.result.ref);
  await settleBackground();
}

/** Real collected money in the general fund (a fine and its payment, through the ledger builders). */
async function seedGeneralFund(groupId: string, membershipId: string, amount: number) {
  const at = clock.now().toISOString();
  await appendLedger(groupId, [
    entryOf('FINE_ASSESSED', rules.fineAssessedPostings({ membershipId, amount }), {
      membershipId,
      occurredAt: at,
    }),
    entryOf(
      'PAYMENT_RECEIVED',
      rules.paymentReceivedPostings({
        payerMembershipId: membershipId,
        fee: 0,
        feeSource: 'PROVIDER',
        parts: [{ kind: 'DEBT', amount, ref: 'eval-seed' }],
      }),
      { membershipId, occurredAt: at },
    ),
  ]);
}

/** The plan `closeCycle` will follow, from the same facts it reads (see test/flows/cycle-end). */
async function planOf(groupId: string, cycle: { number: number; rotation: string[] }) {
  const chain = await readChain(prisma, groupId);
  const summary = rules.summarizeBalances(rules.computeBalances(chain));
  const memberships = await prisma.membership.findMany({
    where: { groupId, status: { in: ['ACTIVE', 'LEAVING'] } },
  });
  const owed = await prisma.obligation.groupBy({
    by: ['membershipId'],
    where: { groupId, status: 'DUE' },
    _sum: { amount: true },
  });
  const unpaid = new Map(owed.map((row) => [row.membershipId, row._sum.amount ?? 0]));
  const members: CycleCloseMember[] = memberships.map((m) => ({
    membershipId: m.id,
    status: m.status,
    activeFromCycle: m.activeFromCycle,
    unpaidObligations: unpaid.get(m.id) ?? 0,
    receivable: Math.max(0, summary.receivableByMember[m.id] ?? 0),
  }));
  return rules.planCycleClose({
    cycleNumber: cycle.number,
    distributeFundAtCycleEnd: true,
    generalFund: summary.generalFund,
    receivables: summary.receivables,
    availableForLoans: rules.availableForLoans({ summary }),
    rotation: cycle.rotation,
    members,
  });
}

/** Free TCP ports, to print the commands that start the API and the web app. */
function isFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '0.0.0.0');
  });
}
async function firstFree(from: number, to: number): Promise<number | null> {
  for (let port = from; port <= to; port += 1) if (await isFree(port)) return port;
  return null;
}

async function main(): Promise<void> {
  const database = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  if (database[0]?.db !== 'njangitrust_eval') fail('The connection is not njangitrust_eval');
  console.log('Building the between-cycles group in njangitrust_eval ...');

  // About seven months ago: the whole cycle (first payout +45 days, five monthly rounds) ends
  // well before today, and every date in it is explicit.
  const t0 = new Date(Date.now() - 230 * DAY);
  t0.setUTCHours(9, 0, 0, 0);
  setTestClock(t0);
  const firstPayoutAt = new Date(t0.getTime() + 45 * DAY);
  firstPayoutAt.setUTCHours(17, 0, 0, 0);

  const names = {
    admin: 'Aline Mbarga',
    m1: 'Denis Fotso',
    m2: 'Lucie Ndi',
    m3: 'Samuel Atangana',
    m4: 'Sylvie Ewane',
    newcomer: 'Nadege Essomba',
  };

  // --- group and founding members -------------------------------------------------------------
  const adminUser = await factories.signUp({ name: names.admin });
  const created = await factories.createGroup(adminUser, {
    name: 'Between cycles (eval)',
    firstPayoutAt: firstPayoutAt.toISOString(),
  });
  const groupId = created.groupId;
  await prisma.group.update({
    where: { id: groupId },
    data: { providerAccount: `test-${groupId}` },
  });
  const admin: Member = { ...adminUser, membershipId: created.adminMembershipId };

  const founding: Member[] = [];
  for (const name of [names.m1, names.m2, names.m3, names.m4]) {
    const fresh = await relogin(admin);
    const body = factories.signupBody({ name, phone: await factories.freshPhone() });
    const token = await factories.inviteToken(fresh, groupId, { name, phone: body.phone });
    const res = await api(null, { ownPhones: factories.ownPhonesOf(body) }).post(
      `/v1/auth/invites/${token}/accept`,
      { mode: 'signup', ...body },
    );
    if (res.status !== 201) fail(`invite accept failed: ${res.status}`);
    founding.push(memberOf(res));
  }

  // --- start the first cycle (draws the order) --------------------------------------------------
  const startAdmin = await relogin(admin);
  const startCard = await api(startAdmin).post(`/v1/groups/${groupId}/cycles/start`);
  if (startCard.status !== 201) fail(`start card refused: ${startCard.status}`);
  await confirmAs(admin, bodyOf<CardBody>(startCard).action.id);
  const cycle = await prisma.cycle.findFirstOrThrow({ where: { groupId, number: 1 } });
  const rounds = await prisma.round.findMany({
    where: { cycleId: cycle.id },
    orderBy: { number: 'asc' },
  });
  const everyone: Member[] = [admin, ...founding];
  const indexOf = (m: Member) => cycle.rotation.indexOf(m.membershipId);

  // --- roles -----------------------------------------------------------------------------------
  // The debtor must be served BEFORE the round they skip (a later payout of their own would settle
  // the debt), so: the earliest non-admin in the order, who skips the round after their own turn.
  const nonAdmin = founding.filter((m) => indexOf(m) <= rounds.length - 2);
  const debtor = [...nonAdmin].sort((a, b) => indexOf(a) - indexOf(b))[0] ?? fail('no debtor');
  const skippedRound = indexOf(debtor) + 2;
  const leaver =
    founding
      .filter((m) => m.membershipId !== debtor.membershipId)
      .sort((a, b) => indexOf(b) - indexOf(a))[0] ?? fail('no leaver');
  const sharers = founding.filter(
    (m) => m.membershipId !== debtor.membershipId && m.membershipId !== leaver.membershipId,
  );

  // The leaver announces leaving at the end of the cycle (card + confirm).
  const leaveCard = await api(await relogin(leaver)).post(`/v1/groups/${groupId}/leave`);
  if (leaveCard.status !== 201) fail(`leave card refused: ${leaveCard.status}`);
  await confirmAs(leaver, bodyOf<CardBody>(leaveCard).action.id);

  // Collected money in the general fund, shared at the end.
  await seedGeneralFund(groupId, admin.membershipId, 20_003);

  // --- play every round -------------------------------------------------------------------------
  let newcomer: Member | null = null;
  for (const round of rounds) {
    if (round.number > 1) {
      goTo(new Date(rounds[round.number - 2]!.payoutAt.getTime() + 60_000));
      if (!(await openRound(round.id))) fail(`round ${round.number} did not open`);
    }
    for (const member of everyone) {
      if (member.membershipId === debtor.membershipId && round.number === skippedRound) continue;
      await payRound(groupId, member, round.number);
    }
    const fresh = await prisma.round.findUniqueOrThrow({ where: { id: round.id } });
    goTo(new Date(fresh.payoutAt.getTime() + 60_000));
    if (round.number === skippedRound) await assessRoundFines(round.id);
    if (!(await openPayout(round.id))) fail(`payout ${round.number} did not open`);

    // The group votes a newcomer in during the cycle (R12.1): they join as INVITED, active from the
    // next cycle, so they get no share of this one.
    if (round.number === 2) {
      const body = factories.signupBody({
        name: names.newcomer,
        phone: await factories.freshPhone(),
      });
      const proposalId = await propose(await relogin(admin), groupId, {
        type: 'MEMBER_ADD',
        name: body.name,
        phone: body.phone,
      });
      for (const voter of everyone) {
        if ((await proposalStatus(admin, proposalId)) !== 'OPEN') break;
        await vote(await relogin(voter), proposalId, 'YES');
      }
      if ((await proposalStatus(admin, proposalId)) === 'OPEN') {
        await closeAtDeadline(proposalId);
      }
      if ((await proposalStatus(admin, proposalId)) !== 'PASSED') {
        fail('The MEMBER_ADD vote did not pass');
      }
      const token = await factories.inviteToken(await relogin(admin), groupId, {
        name: body.name,
        phone: body.phone,
        proposalId,
      });
      const res = await api(null, { ownPhones: factories.ownPhonesOf(body) }).post(
        `/v1/auth/invites/${token}/accept`,
        { mode: 'signup', ...body },
      );
      if (res.status !== 201) fail(`newcomer accept failed: ${res.status}`);
      newcomer = memberOf(res);
    }
  }
  if (!newcomer) fail('The newcomer was not created');

  // --- close the cycle at the last payout (+1 hour); keep a non-zero remainder -------------------
  const lastPayout = rounds[rounds.length - 1]!.payoutAt;
  const closeAt = new Date(lastPayout.getTime() + 3_600_000);
  goTo(closeAt);
  const closing = { number: cycle.number, rotation: cycle.rotation };
  let plan = await planOf(groupId, closing);
  for (let extra = 0; extra < 4 && plan.distribution.ok && plan.event.remainder === 0; extra += 1) {
    await seedGeneralFund(groupId, admin.membershipId, 1);
    plan = await planOf(groupId, closing);
  }
  if (!plan.distribution.ok) fail(`nothing to distribute: ${plan.distribution.code ?? ''}`);
  if (plan.event.remainder === 0) fail('could not arrange a non-zero remainder');

  if (!(await closeCycle(cycle.id, closeAt))) fail('closeCycle did not close the cycle');
  await settleBackground();

  // --- checks ------------------------------------------------------------------------------------
  const group = await prisma.group.findUniqueOrThrow({ where: { id: groupId } });
  if (group.currentCycleId !== null) fail('the group still has a current cycle');
  const chain = await readChain(prisma, groupId);
  const problems = rules.checkLedger(groupId, chain);
  if (problems.length > 0) fail(`ledger problems: ${JSON.stringify(problems).slice(0, 400)}`);
  const distribution = chain.find((t) => t.type === 'FUND_DISTRIBUTION');
  const closedEvent = chain.find(
    (t) => t.type === 'EVENT' && (t.metadata as { event?: string }).event === 'CYCLE_CLOSED',
  );
  if (!distribution || !closedEvent) fail('FUND_DISTRIBUTION or CYCLE_CLOSED is missing');
  const shareOf = (m: Member) =>
    distribution.postings.find((p) => p.account === `payable:member:${m.membershipId}`)?.amount;
  if (shareOf(debtor) !== undefined) fail('the debtor received a share');
  if (shareOf(newcomer) !== undefined) fail('the newcomer received a share');
  const statuses = await prisma.membership.findMany({
    where: { groupId },
    select: { id: true, status: true },
  });
  const statusOf = (m: Member) => statuses.find((s) => s.id === m.membershipId)?.status;
  const participants = statuses.filter((s) => s.status === 'ACTIVE' || s.status === 'INVITED');
  if (statusOf(leaver) !== 'LEFT') fail('the leaver is not LEFT');
  if (statusOf(newcomer) !== 'INVITED') fail('the newcomer is not INVITED');
  if (participants.length < 3) fail('fewer than 3 participants');
  const debt = await prisma.obligation.aggregate({
    where: { groupId, membershipId: debtor.membershipId, status: 'DUE' },
    _sum: { amount: true },
  });

  // --- report ------------------------------------------------------------------------------------
  const apiPort = await firstFree(3000, 3199);
  const webPort = await firstFree(8081, 8099);
  const share = plan.event.share ?? 0;
  const line = (role: string, m: Member, note: string) =>
    console.log(`  ${role.padEnd(9)} ${m.name.padEnd(17)} login ${m.phone}  PIN ${m.pin}  ${note}`);
  console.log('\n=== Group between cycles (njangitrust_eval) ===');
  console.log(`Group id: ${groupId}   (cycle 1 closed, currentCycleId = null)`);
  console.log(
    `Fund shared: ${plan.event.distributed} FCFA = ${share} FCFA x ${plan.event.eligibleCount}; ` +
      `remainder kept in the fund: ${plan.event.remainder} FCFA; ` +
      `debts owed to the fund: ${plan.event.receivables} FCFA`,
  );
  console.log(`Participants in the next cycle: ${participants.length}`);
  console.log('\nThrowaway accounts (all use the repo test PIN):');
  line('ADMIN', admin, `share ${shareOf(admin) === undefined ? 0 : -shareOf(admin)!}`);
  line('SHARER', sharers[0]!, `share ${-(shareOf(sharers[0]!) ?? 0)}`);
  line('SHARER', sharers[1]!, `share ${-(shareOf(sharers[1]!) ?? 0)}`);
  line(
    'DEBTOR',
    debtor,
    `no share; owes ${debt._sum.amount ?? 0} FCFA (round ${skippedRound} + fine)`,
  );
  line('LEAVER', leaver, `share ${-(shareOf(leaver) ?? 0)}, then LEFT`);
  line('NEWCOMER', newcomer, 'INVITED (voted in), no share, takes part next cycle');
  console.log(
    `\nRotation order kept for the next cycle (first to last): ${cycle.rotation
      .map(
        (id) =>
          everyone.concat(newcomer ? [newcomer] : []).find((m) => m.membershipId === id)?.name,
      )
      .join(', ')}`,
  );

  if (apiPort === null || webPort === null) {
    console.log('\nNo free port in 3000-3199 / 8081-8099.');
  } else {
    console.log(`\nFree ports found: API ${apiPort}, web ${webPort}. To start them (PowerShell):`);
    console.log(
      `  cd apps\\api; $env:PORT='${apiPort}'; $env:PAYMENT_PROVIDER='mock'; ` +
        `$env:PUBLIC_BASE_URL='http://localhost:${apiPort}'; $env:PUBLIC_APP_URL='http://localhost:${webPort}'; ` +
        `$env:WEB_ORIGINS='http://localhost:${webPort},http://127.0.0.1:${webPort}'; ` +
        `node ..\\..\\node_modules\\tsx\\dist\\cli.mjs --env-file=.env scripts/serve-eval.ts`,
    );
    console.log(
      `  cd apps\\mobile; $env:EXPO_PUBLIC_API_URL='http://localhost:${apiPort}'; $env:CI='1'; ` +
        `node ..\\..\\node_modules\\expo\\bin\\cli start --port ${webPort} --offline`,
    );
    console.log(`  then open http://localhost:${webPort} at 390 and 360 px.`);
  }
}

main()
  .catch((error: unknown) => {
    console.error('Failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());
