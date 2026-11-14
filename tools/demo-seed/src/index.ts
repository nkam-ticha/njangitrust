// Demo data (spec 5.5) through the real HTTP API: no direct database writes, so every rule, audit
// row and notification is exactly what the app would produce. Safe to run again: it creates only
// what is missing. Usage: `pnpm demo:seed` (API running; DEMO_API_URL overrides http://localhost:3000).
//
// Today the API allows: accounts, both groups and their founding members. Cycles, payments, loans,
// votes, meetings and chat wait for their services (the seed will grow with them).
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
  log(
    '\nCycles, payments, loans, votes, meetings and chat are not seeded yet: their API is not built.',
  );
}

main().catch((error: unknown) => {
  console.error(`\nDemo seed stopped: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
