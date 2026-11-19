// Demo data (spec 5.5) through the real HTTP API: no direct database writes, so every rule, audit
// row and notification is exactly what the app would produce. Safe to run again: it creates only
// what is missing. Usage: `pnpm demo:seed` (API running; DEMO_API_URL overrides http://localhost:3000).
//
// It creates: accounts, both groups and their founding members, the first cycle, the first round's
// contributions (a few members left unpaid on purpose) and some chat. Payments need the mock
// operator (PAYMENT_PROVIDER=mock): the demo numbers are fictional. Loans, votes and meetings are
// not seeded.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiFailure, createClient } from './http';
import { DEMO_PIN, groups, type GroupPlan, type Person } from './people';

const CONSENT_VERSION = '2026-11'; // contracts/auth CURRENT_CONSENT_VERSION
const baseUrl = (process.env.DEMO_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const log = (line: string) => console.log(line);
const api = createClient(baseUrl, log);

interface Session {
  token: string;
  userId: string;
}
const sessions = new Map<string, Session>();

interface AuthBody {
  user: { id: string };
  session: { accessToken: string };
}

/** Refuses to run against anything but a development API (demo PINs are development-only). */
function assertDevelopment(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const envFile = resolve(here, '../../../apps/api/.env');
  let nodeEnv = 'development';
  try {
    const line = readFileSync(envFile, 'utf8')
      .split(/\r?\n/)
      .find((l) => l.startsWith('NODE_ENV='));
    if (line) nodeEnv = line.slice('NODE_ENV='.length).trim();
  } catch {
    throw new Error(`Cannot read ${envFile}. Run apps/api/scripts/setup-db.ps1 first.`);
  }
  if (nodeEnv !== 'development') {
    throw new Error(`apps/api/.env has NODE_ENV=${nodeEnv}: demo data is for development only.`);
  }
  const host = new URL(baseUrl).hostname;
  const local = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/.test(
    host,
  );
  if (!local) throw new Error(`Refusing to seed ${baseUrl}: not a local or LAN address.`);
}

function remember(person: Person, body: AuthBody): Session {
  const session = { token: body.session.accessToken, userId: body.user.id };
  sessions.set(person.phone, session);
  return session;
}

async function login(person: Person): Promise<Session> {
  const cached = sessions.get(person.phone);
  if (cached) return cached;
  try {
    const body = await api.post<AuthBody>('/v1/auth/login', { phone: person.phone, pin: DEMO_PIN });
    return remember(person, body);
  } catch (error) {
    if (error instanceof ApiFailure && error.code.startsWith('INVALID_CREDENTIALS')) {
      throw new Error(
        `${person.name} exists but the demo PIN no longer works (PIN changed?). Reset it in the app.`,
        { cause: error },
      );
    }
    throw error;
  }
}

/** Signs a person up, or logs them in when the account already exists. */
async function ensureAccount(person: Person): Promise<Session> {
  const cached = sessions.get(person.phone);
  if (cached) return cached;
  try {
    const body = await api.post<AuthBody>('/v1/auth/signup', {
      name: person.name,
      phone: person.phone,
      consent: true,
      consentVersion: CONSENT_VERSION,
      pin: DEMO_PIN,
      language: person.language ?? 'fr',
    });
    log(`  + account ${person.name}`);
    return remember(person, body);
  } catch (error) {
    if (error instanceof ApiFailure && error.code === 'PHONE_ALREADY_REGISTERED')
      return login(person);
    throw error;
  }
}

// Times in UTC; Douala is UTC+1 all year (no daylight saving).
const DOUALA_OFFSET_HOURS = 1;
const DAY = 86_400_000;

/** The last Saturday of a month at 18:00 Douala, the first one at least 7 days ahead. */
function lastSaturdayAt18(now: Date): string {
  for (let add = 0; add < 3; add++) {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() + add;
    const lastDay = new Date(Date.UTC(y, m + 1, 0));
    const back = (lastDay.getUTCDay() - 6 + 7) % 7;
    const at = Date.UTC(y, m, lastDay.getUTCDate() - back, 18 - DOUALA_OFFSET_HOURS, 0);
    if (at - now.getTime() >= 7 * DAY) return new Date(at).toISOString();
  }
  throw new Error('no payout date found');
}

/** The next Sunday at 10:00 Douala, at least 3 days ahead. */
function nextSundayAt10(now: Date): string {
  for (let add = 3; add < 11; add++) {
    const d = new Date(now.getTime() + add * DAY);
    if (d.getUTCDay() === 0) {
      return new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 10 - DOUALA_OFFSET_HOURS),
      ).toISOString();
    }
  }
  throw new Error('no payout date found');
}

interface MyGroup {
  groupId: string;
  name: string;
  role: string;
}

async function ensureGroup(plan: GroupPlan, admin: Session): Promise<string> {
  const { groups: mine } = await api.get<{ groups: MyGroup[] }>('/v1/me/groups', admin.token);
  const existing = mine.find((g) => g.name === plan.name && g.role === 'ADMIN');
  if (existing) {
    log(`  = group ${plan.name} already exists`);
    return existing.groupId;
  }
  const now = new Date();
  const monthly = plan.frequency === 'MONTHLY';
  const created = await api.post<{ group: { id: string } }>(
    '/v1/groups',
    {
      name: plan.name,
      firstPayoutAt: monthly ? lastSaturdayAt18(now) : nextSundayAt10(now),
      ...(monthly ? { monthlyAnchor: 'LAST_WEEKDAY' } : {}),
      rules: {
        frequency: plan.frequency,
        contributionAmount: plan.contributionAmount,
        solidarityContribution: plan.solidarityContribution,
      },
    },
    admin.token,
  );
  log(`  + group ${plan.name}`);
  return created.group.id;
}

interface PendingActionBody {
  action: { id: string };
}

/** Invites one person (founding member, confirmed by the admin) and accepts for them. */
async function addMember(groupId: string, person: Person, admin: Session): Promise<boolean> {
  let link: string;
  try {
    const { action } = await api.post<PendingActionBody>(
      `/v1/groups/${groupId}/invites`,
      { name: person.name, phone: person.phone },
      admin.token,
    );
    const confirmed = await api.post<{ data: { type: string; link?: string } }>(
      `/v1/pending-actions/${action.id}/confirm`,
      {},
      admin.token,
    );
    if (!confirmed.data.link) throw new Error(`no invite link for ${person.name}`);
    link = confirmed.data.link;
  } catch (error) {
    if (error instanceof ApiFailure && error.code === 'INVITE_ALREADY_PENDING') {
      log(`  ! ${person.name}: an earlier invite is still pending (72 h); skipped`);
      return false;
    }
    throw error;
  }
  const token = link.slice(link.lastIndexOf('/') + 1);
  const accept = (body: unknown, bearer?: string) =>
    api.post<Partial<AuthBody>>(`/v1/auth/invites/${token}/accept`, body, bearer);

  const known = sessions.get(person.phone);
  if (known) {
    await accept({ mode: 'existing' }, known.token);
  } else {
    try {
      const body = await accept({
        mode: 'signup',
        name: person.name,
        phone: person.phone,
        consent: true,
        consentVersion: CONSENT_VERSION,
        pin: DEMO_PIN,
        language: person.language ?? 'fr',
      });
      if (body.user && body.session) remember(person, body as AuthBody);
    } catch (error) {
      if (!(error instanceof ApiFailure && error.code === 'PHONE_ALREADY_REGISTERED')) throw error;
      // The account exists from an earlier run or another group: accept as that member.
      await accept({ mode: 'existing' }, (await login(person)).token);
    }
  }
  log(`  + ${person.name} joined`);
  return true;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Overview {
  group: { status: string };
}

/** GRP-02: the admin starts the first cycle (a card, then its confirmation). */
async function ensureCycle(groupId: string, admin: Session): Promise<boolean> {
  const { group } = await api.get<Overview>(`/v1/groups/${groupId}/overview`, admin.token);
  if (group.status !== 'FORMING') {
    log('  = cycle already started');
    return true;
  }
  try {
    const { action } = await api.post<PendingActionBody>(
      `/v1/groups/${groupId}/cycles/start`,
      {},
      admin.token,
    );
    await api.post(`/v1/pending-actions/${action.id}/confirm`, {}, admin.token);
    log('  + cycle started (draw recorded)');
    return true;
  } catch (error) {
    if (!(error instanceof ApiFailure)) throw error;
    log(`  ! cycle not started: ${error.code}`);
    return false;
  }
}

interface Due {
  id: string;
  roundNumber: number | null;
}

/** Pays everything the member owes for round 1; returns the payment to follow, if one was made. */
async function payFirstRound(groupId: string, person: Person): Promise<string | null> {
  const session = await login(person);
  const { dues } = await api.get<{ dues: Due[] }>(`/v1/groups/${groupId}/me/dues`, session.token);
  const first = dues.filter((due) => due.roundNumber === 1).map((due) => due.id);
  if (first.length === 0) return null;
  try {
    const { action } = await api.post<PendingActionBody>(
      `/v1/groups/${groupId}/payments`,
      { obligationIds: first },
      session.token,
    );
    const confirmed = await api.post<{ action: { result?: { ref?: string } } }>(
      `/v1/pending-actions/${action.id}/confirm`,
      {},
      session.token,
    );
    return confirmed.action.result?.ref ?? null;
  } catch (error) {
    if (error instanceof ApiFailure && error.code === 'PAYMENT_ALREADY_PENDING') return null;
    throw error;
  }
}

/** Waits until the operator has answered (the API's job runner checks every few seconds). */
async function awaitPayment(paymentId: string, person: Person): Promise<string> {
  const session = await login(person);
  for (let attempt = 0; attempt < 30; attempt++) {
    const { payment } = await api.get<{ payment: { status: string } }>(
      `/v1/payments/${paymentId}`,
      session.token,
    );
    if (payment.status === 'SUCCESSFUL' || payment.status === 'FAILED') return payment.status;
    await sleep(2_000);
  }
  return 'PENDING';
}

async function seedPayments(plan: GroupPlan, groupId: string): Promise<void> {
  const started: { person: Person; paymentId: string }[] = [];
  for (const person of [plan.admin, ...plan.members]) {
    if (plan.unpaid.includes(person)) continue;
    const paymentId = await payFirstRound(groupId, person);
    if (paymentId) started.push({ person, paymentId });
  }
  if (started.length === 0) {
    log('  = first-round contributions already paid');
    return;
  }
  for (const { person, paymentId } of started) {
    const status = await awaitPayment(paymentId, person);
    log(`  ${status === 'SUCCESSFUL' ? '+' : '!'} ${person.name} contribution: ${status}`);
  }
}

async function seedChat(plan: GroupPlan, groupId: string, admin: Session): Promise<void> {
  const { messages } = await api.get<{ messages: { kind?: string; text?: string | null }[] }>(
    `/v1/groups/${groupId}/messages?limit=100`,
    admin.token,
  );
  const present = new Set(messages.map((message) => message.text));
  let added = 0;
  for (const line of plan.chat) {
    if (present.has(line.text)) continue;
    await api.post(
      `/v1/groups/${groupId}/messages`,
      { text: line.text },
      (await login(line.from)).token,
    );
    added++;
  }
  log(added > 0 ? `  + ${added} chat messages` : '  = chat already seeded');
}

interface ProposalRow {
  id: string;
  type: string;
  status: string;
}

/** An open vote to change the late fine, so a member can be asked to vote on it. */
async function ensureRuleProposal(
  plan: GroupPlan,
  groupId: string,
  proposal: NonNullable<GroupPlan['ruleProposal']>,
): Promise<void> {
  const proposer = await login(proposal.from);
  const { proposals } = await api.get<{ proposals: ProposalRow[] }>(
    `/v1/groups/${groupId}/proposals?status=OPEN`,
    proposer.token,
  );
  if (proposals.some((p) => p.type === 'RULE_CHANGE')) {
    log('  = rule-change vote already open');
    return;
  }
  try {
    const { action } = await api.post<PendingActionBody>(
      `/v1/groups/${groupId}/proposals`,
      {
        type: 'RULE_CHANGE',
        changes: { lateFine: proposal.lateFine },
        reason: 'Des amendes plus légères pour les retards',
      },
      proposer.token,
    );
    await api.post(`/v1/pending-actions/${action.id}/confirm`, {}, proposer.token);
    log(`  + vote opened: late fine to ${proposal.lateFine} FCFA`);
  } catch (error) {
    if (!(error instanceof ApiFailure)) throw error;
    log(`  ! rule-change vote not opened: ${error.code}`);
  }
  void plan;
}

/** A payment number changed through the member's own PIN-confirmed action (R13.2). */
async function ensureNumberChange(change: NonNullable<GroupPlan['numberChange']>): Promise<void> {
  const session = await login(change.who);
  try {
    const { action } = await api.post<PendingActionBody>(
      '/v1/me/payment-number',
      { number: change.newNumber, operator: 'ORANGE' },
      session.token,
    );
    await api.post(`/v1/pending-actions/${action.id}/confirm`, { pin: DEMO_PIN }, session.token);
    log(`  + ${change.who.name} changed their payment number (withdrawals held 48 h)`);
  } catch (error) {
    if (error instanceof ApiFailure && error.code === 'NUMBER_UNCHANGED') {
      log(`  = ${change.who.name} already has the new payment number`);
      return;
    }
    throw error;
  }
}

async function seedGroup(plan: GroupPlan): Promise<void> {
  log(`\n${plan.name}`);
  const admin = await ensureAccount(plan.admin);
  const groupId = await ensureGroup(plan, admin);
  const { members } = await api.get<{ members: { name: string; status: string }[] }>(
    `/v1/groups/${groupId}/members`,
    admin.token,
  );
  const present = new Set(
    members.filter((m) => ['INVITED', 'ACTIVE', 'LEAVING'].includes(m.status)).map((m) => m.name),
  );
  for (const person of plan.members) {
    if (present.has(person.name)) log(`  = ${person.name} already a member`);
    else await addMember(groupId, person, admin);
  }
  if (await ensureCycle(groupId, admin)) await seedPayments(plan, groupId);
  await seedChat(plan, groupId, admin);
  if (plan.ruleProposal) await ensureRuleProposal(plan, groupId, plan.ruleProposal);
  await ensureAllFsdProposals(plan, groupId, admin);
  if (plan.numberChange) await ensureNumberChange(plan.numberChange);
}

async function ensureAllFsdProposals(
  plan: GroupPlan,
  groupId: string,
  admin: Session,
): Promise<void> {
  const { proposals } = await api.get<{ proposals: ProposalRow[] }>(
    `/v1/groups/${groupId}/proposals?status=OPEN`,
    admin.token,
  );
  const types = new Set(proposals.map((p) => p.type));

  const { members } = await api.get<{
    members: { membershipId: string; name: string; role: string; status: string }[];
  }>(`/v1/groups/${groupId}/members`, admin.token);
  const active = members.filter((m) => m.status === 'ACTIVE');
  if (active.length < 3) return;

  if (!types.has('MEMBER_ADD')) {
    try {
      const { action } = await api.post<PendingActionBody>(
        `/v1/groups/${groupId}/proposals`,
        {
          type: 'MEMBER_ADD',
          name: 'Hervé Nana',
          phone: '+237699000202',
          reason: 'Intégrer Hervé Nana au prochain cycle',
        },
        admin.token,
      );
      await api.post(`/v1/pending-actions/${action.id}/confirm`, {}, admin.token);
      log('  + vote opened: add Hervé Nana');
    } catch {
      /* already exists or ineligible */
    }
  }

  if (!types.has('ROTATION_CHANGE') && active.length >= 2) {
    const nonAdmin = active.filter((m) => m.role !== 'ADMIN');
    const first = nonAdmin[0];
    const second = nonAdmin[1];
    if (first && second) {
      try {
        const { action } = await api.post<PendingActionBody>(
          `/v1/groups/${groupId}/proposals`,
          {
            type: 'ROTATION_CHANGE',
            swap: [first.membershipId, second.membershipId],
            reason: 'Échange de tour pour concilier nos contraintes',
          },
          admin.token,
        );
        await api.post(`/v1/pending-actions/${action.id}/confirm`, {}, admin.token);
        log('  + vote opened: rotation swap');
      } catch {
        /* already exists or ineligible */
      }
    }
  }

  if (!types.has('ADMIN_CHANGE')) {
    const candidate = active.find((m) => m.role !== 'ADMIN');
    if (candidate) {
      try {
        const { action } = await api.post<PendingActionBody>(
          `/v1/groups/${groupId}/proposals`,
          {
            type: 'ADMIN_CHANGE',
            membershipId: candidate.membershipId,
            reason: `Transmission du rôle d'administrateur à ${candidate.name}`,
          },
          admin.token,
        );
        await api.post(`/v1/pending-actions/${action.id}/confirm`, {}, admin.token);
        log(`  + vote opened: admin change to ${candidate.name}`);
      } catch {
        /* already exists or ineligible */
      }
    }
  }

  if (!types.has('MEMBER_REMOVE')) {
    const target = active.filter((m) => m.role !== 'ADMIN').slice(-1)[0];
    if (target) {
      try {
        const { action } = await api.post<PendingActionBody>(
          `/v1/groups/${groupId}/proposals`,
          {
            type: 'MEMBER_REMOVE',
            membershipId: target.membershipId,
            reason: 'Absences répétées non justifiées et retards',
          },
          admin.token,
        );
        await api.post(`/v1/pending-actions/${action.id}/confirm`, {}, admin.token);
        log(`  + vote opened: member remove for ${target.name}`);
      } catch {
        /* already exists or ineligible */
      }
    }
  }

  if (!types.has('SOLIDARITY_PAYOUT')) {
    const fallback = active.length > 0 ? active[0] : null;
    const recipient = active.find((m) => m.role !== 'ADMIN') ?? fallback;
    if (recipient) {
      try {
        const { action } = await api.post<PendingActionBody>(
          `/v1/groups/${groupId}/solidarity/requests`,
          {
            recipientMembershipId: recipient.membershipId,
            event: 'DEUIL',
            amount: 25_000,
            note: 'Assistance pour les obsèques familiales',
          },
          admin.token,
        );
        await api.post(`/v1/pending-actions/${action.id}/confirm`, {}, admin.token);
        log(`  + vote opened: solidarity payout for ${recipient.name}`);
      } catch {
        /* already exists or ineligible */
      }
    }
  }

  if (!types.has('LEDGER_CORRECTION')) {
    try {
      const { action } = await api.post<PendingActionBody>(
        `/v1/groups/${groupId}/proposals`,
        {
          type: 'LEDGER_CORRECTION',
          seq: 1,
          correction: 'Correction de l’écriture de lancement',
          reason: 'Harmonisation comptable des libellés du registre',
        },
        admin.token,
      );
      await api.post(`/v1/pending-actions/${action.id}/confirm`, {}, admin.token);
      log('  + vote opened: ledger correction for seq 1');
    } catch {
      /* already exists or ineligible */
    }
  }
}

function localNumber(e164: string): string {
  const d = e164.replace(/^\+237/, '');
  return `${d[0]} ${d.slice(1, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
}

async function main(): Promise<void> {
  assertDevelopment();
  try {
    await fetch(`${baseUrl}/health`);
  } catch {
    throw new Error(
      `The API is not reachable at ${baseUrl}. Start it first (pnpm dev:api or pnpm demo).`,
    );
  }
  log(`NjangiTrust demo seed → ${baseUrl}`);
  for (const plan of groups) await seedGroup(plan);

  const people = new Map<string, Person>();
  for (const plan of groups) for (const p of [plan.admin, ...plan.members]) people.set(p.phone, p);
  log(`\nDemo logins (development only). PIN for everyone: ${DEMO_PIN}`);
  for (const p of people.values()) {
    const roles = groups
      .filter((g) => g.admin === p || g.members.includes(p))
      .map((g) => `${g.name}${g.admin === p ? ' (admin)' : ''}`)
      .join(', ');
    log(`  ${p.name.padEnd(18)} ${localNumber(p.phone)}   ${roles}`);
  }
  log('\nLoans, votes and meetings are not seeded: create them in the app.');
}

main().catch((error: unknown) => {
  console.error(`\nDemo seed stopped: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
