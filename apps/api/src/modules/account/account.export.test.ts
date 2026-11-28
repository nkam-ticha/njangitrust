// Export of my personal data (spec Part 7, FSD PRV-03, D34): only the caller's own data. The tests
// give two members numbers, votes, messages and conversations, then prove that nothing of the other
// one, no hash, no token, no storage key and no secret choice is anywhere in the JSON text.
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { dataExportSchema, type DataExport } from '@njangi/shared/contracts/account';
import { getPrisma } from '../../lib/prisma';
import { stageApi } from '../../../test/helpers/stage-client';
import { signUp } from '../../../test/helpers/factories';
import { statementWorld, type StatementWorld } from '../../../test/helpers/statement-world';

let w: StatementWorld;
let others: { phone: string; paymentNumber: string; label: string }[];
let mineJson: string;
let mine: DataExport;
let beneficiaryJson: string;
let strangerJson: string;
let secretProposalId: string;

const PUSH_TOKEN = `ExponentPushToken[${randomUUID().replace(/-/g, '')}]`;
const STATEMENT_CODE = randomUUID().replace(/-/g, '').slice(0, 12);
const PROVIDER_REF = `REF-OPERATEUR-SECRETE-${randomUUID()}`;
const OTHER_MARKER = 'MARQUEUR-UNIQUE-DE-L-AUTRE';
const HOUR = '2026-10-05T08:00:00.000Z';

async function exportOf(user: Parameters<typeof stageApi>[0]) {
  const res = await stageApi(user).get('/v1/me/data-export');
  expect(res.status).toBe(200);
  return res;
}

beforeAll(async () => {
  w = await statementWorld();
  const prisma = getPrisma();
  const me = w.lateMember;
  const other = w.beneficiary;

  // Votes: a secret one (receipt only) and one by show of hands where both of us voted differently.
  const base = {
    groupId: w.groupId,
    payload: {},
    proposerMembershipId: w.admin.membershipId,
    eligibleMembershipIds: w.rotation.map((m) => m.membershipId),
    thresholdKind: 'MAJORITY' as const,
    opensAt: new Date('2026-10-05T08:00:00.000Z'),
    closesAt: new Date('2026-10-08T08:00:00.000Z'),
    status: 'EXPIRED' as const,
    closedAt: new Date('2026-10-08T08:00:00.000Z'),
    yesCount: 2,
    noCount: 1,
  };
  const secret = await prisma.proposal.create({
    data: { ...base, type: 'MEMBER_REMOVE', secret: true },
  });
  secretProposalId = secret.id;
  const open = await prisma.proposal.create({
    data: { ...base, type: 'FINE_WAIVER', secret: false },
  });
  await prisma.voteReceipt.createMany({
    data: [
      {
        proposalId: secret.id,
        membershipId: me.membershipId,
        votedAt: new Date('2026-10-05T08:37:12Z'),
      },
      { proposalId: secret.id, membershipId: other.membershipId },
      { proposalId: open.id, membershipId: me.membershipId },
      { proposalId: open.id, membershipId: other.membershipId },
    ],
  });
  await prisma.ballot.createMany({
    data: [
      { proposalId: open.id, membershipId: me.membershipId, choice: 'YES' },
      { proposalId: open.id, membershipId: other.membershipId, choice: 'NO' },
    ],
  });

  // Chat: my message (naming the other member's number), my deleted message, and the other's.
  await prisma.message.createMany({
    data: [
      {
        groupId: w.groupId,
        authorMembershipId: me.membershipId,
        kind: 'TEXT',
        text: `Appelle-le au ${other.phone} ou au ${other.paymentNumber.replace('+237', '')} ou au ${disguised(other.phone)}`,
      },
      {
        groupId: w.groupId,
        authorMembershipId: me.membershipId,
        kind: 'TEXT',
        text: 'Message que j’ai supprimé',
        deletedAt: new Date(),
      },
      {
        groupId: w.groupId,
        authorMembershipId: other.membershipId,
        kind: 'TEXT',
        text: OTHER_MARKER,
      },
    ],
  });

  // The assistant: my private conversation (a tool line must not travel) and the other's.
  const conversation = (userId: string, lines: ['user' | 'assistant' | 'tool', string][]) =>
    prisma.agentConversation.create({
      data: {
        userId,
        groupId: w.groupId,
        channel: 'PRIVATE',
        messages: { create: lines.map(([role, content]) => ({ role, content })) },
      },
    });
  await conversation(me.id, [
    ['user', 'Combien je dois ?'],
    ['tool', 'TOOL-RESULT-NE-DOIT-PAS-SORTIR'],
    ['assistant', 'Tu dois 11 000 FCFA.'],
  ]);
  await conversation(other.id, [['user', OTHER_MARKER]]);

  // A device with a push token, and a statement with a storage key.
  await prisma.device.create({
    data: { userId: me.id, platform: 'ANDROID', expoPushToken: PUSH_TOKEN },
  });
  await prisma.statement.create({
    data: {
      membershipId: me.membershipId,
      periodStart: new Date('2026-10-01T00:00:00Z'),
      periodEnd: new Date('2026-11-01T00:00:00Z'),
      language: 'fr',
      fileKey: 'statements/CLE-DE-STOCKAGE-SECRETE.pdf',
      verificationCode: STATEMENT_CODE,
      ledgerHeadHash: 'f'.repeat(64),
    },
  });
  // A loan, a withdrawal-like disbursement and a payment of mine, with provider references and my number.
  const loan = await prisma.loan.create({
    data: {
      groupId: w.groupId,
      membershipId: me.membershipId,
      principal: 50_000,
      months: 3,
      ratePermille: 20,
      interest: 3_000,
      feeEstimated: 500,
      totalDue: 53_000,
      status: 'REPAID',
    },
  });
  expect(loan.id).toBeTruthy();
  await prisma.paymentIntent.create({
    data: {
      groupId: w.groupId,
      membershipId: me.membershipId,
      obligationIds: [],
      amount: 11_000,
      phoneSnapshot: me.paymentNumber,
      provider: 'mock',
      providerRef: PROVIDER_REF,
      status: 'SUCCESSFUL',
      fee: 100,
      feeSource: 'SCHEDULE',
    },
  });

  others = [w.admin, w.bea, w.carl, w.dina, w.leaver, w.newcomer, w.stranger, w.beneficiary]
    .filter((m) => m.id !== me.id)
    .map((m) => ({ phone: m.phone, paymentNumber: m.paymentNumber, label: m.name }));

  const res = await exportOf(me);
  mineJson = JSON.stringify(res.body);
  mine = dataExportSchema.parse(res.body.export);
  beneficiaryJson = JSON.stringify((await exportOf(other)).body);
  strangerJson = JSON.stringify((await exportOf(w.stranger)).body);
});

/** A number written with slashes, a disguise the basic pattern of the export used to miss. */
function disguised(number: string): string {
  const n = number.replace(/^\+?237/, '');
  return `${n.slice(0, 3)}/${n.slice(3, 5)}/${n.slice(5, 7)}/${n.slice(7)}`;
}

/** Every spelling a digit run of a number can take in a JSON text. */
function spellings(number: string): string[] {
  const national = number.replace(/^\+?237/, '');
  return [
    number,
    national,
    national.slice(0, 3) + ' ' + national.slice(3),
    number.slice(-8),
    disguised(number),
  ];
}

describe('GET /v1/me/data-export: what it holds', () => {
  it('is the caller’s profile with their own number and a validated, strict shape', () => {
    expect(mine.profile).toMatchObject({ id: w.lateMember.id, phone: w.lateMember.phone });
    expect(mine.format).toBe('njangitrust-personal-data');
    expect(mine.paymentNumbers.map((n) => n.number)).toContain(w.lateMember.paymentNumber);
    expect(mine.groups).toHaveLength(1);
    expect(mine.groups[0]).toMatchObject({
      groupId: w.groupId,
      role: w.lateMember.id === w.admin.id ? 'ADMIN' : 'MEMBER',
      membershipStatus: 'ACTIVE',
      reliability: { onTime: 0, total: 1, percent: null },
    });
  });

  it('lists my contributions, fine, loan and payment in whole francs, nothing else', () => {
    const kinds = mine.obligations.map((o) => `${o.kind}:${o.amount}:${o.onTime}`).sort();
    expect(kinds).toEqual(['CONTRIBUTION:10000:false', 'SOLIDARITY:1000:false']);
    expect(mine.loans).toMatchObject([{ principal: 50_000, totalDue: 53_000, status: 'REPAID' }]);
    expect(mine.payments).toMatchObject([{ amount: 11_000, fee: 100, status: 'SUCCESSFUL' }]);
    expect(mine.withdrawals).toEqual([]);
    for (const n of [...mine.obligations, ...mine.loans, ...mine.payments].flatMap((x) =>
      Object.values(x).filter((v) => typeof v === 'number'),
    ))
      expect(Number.isInteger(n)).toBe(true);
  });

  it('holds the ledger entries about me with only my own postings', () => {
    expect(mine.ledgerEntries.map((e) => e.type).sort()).toEqual([
      'FINE_ASSESSED',
      'PAYMENT_RECEIVED',
    ]);
    const fine = mine.ledgerEntries.find((e) => e.type === 'FINE_ASSESSED')!;
    expect(fine.postings).toEqual([{ account: 'RECEIVABLE', amount: 1_000 }]);
    // The beneficiary's export shows the credits to their payable and their own withdrawal.
    const theirs = JSON.parse(beneficiaryJson).export as DataExport;
    expect(theirs.ledgerEntries.map((e) => e.type)).toContain('DISBURSEMENT_SENT');
    expect(
      theirs.ledgerEntries.every((e) => e.postings.every((p) => p.account === 'PAYABLE')),
    ).toBe(true);
  });

  it('keeps my assistant conversation (without tool lines) and my own chat message, masked', () => {
    expect(mine.assistantConversations).toHaveLength(1);
    expect(mine.assistantConversations[0]!.messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
    ]);
    expect(mineJson).not.toContain('TOOL-RESULT-NE-DOIT-PAS-SORTIR');
    const texts = mine.chatMessages.map((m) => m.text);
    expect(texts).toHaveLength(1);
    expect(texts[0]).toMatch(/^Appelle-le au 6•• •• •• •• ou au 6•• •• •• •• ou au 6•• •• •• ••$/);
    expect(mineJson).not.toContain('Message que j’ai supprimé');
  });

  it('lists my devices without their push token and my statements without storage keys', () => {
    expect(mine.devices).toMatchObject([{ platform: 'ANDROID', pushEnabled: true }]);
    expect(mine.statements).toMatchObject([
      { groupId: w.groupId, verificationCode: STATEMENT_CODE },
    ]);
    for (const secret of [
      PUSH_TOKEN,
      'ExponentPushToken',
      'CLE-DE-STOCKAGE-SECRETE',
      'REF-OPERATEUR-SECRETE',
      PROVIDER_REF,
      'f'.repeat(64),
    ])
      expect(mineJson).not.toContain(secret);
  });
});

describe('GET /v1/me/data-export: what it never holds', () => {
  it('contains no digit sequence of any other member’s numbers, in any export', () => {
    for (const json of [mineJson, beneficiaryJson, strangerJson]) {
      for (const person of others) {
        // A member sees their own numbers in their own export, so skip those of the owner.
        for (const spelling of [...spellings(person.phone), ...spellings(person.paymentNumber)]) {
          const own =
            json === mineJson
              ? w.lateMember
              : json === beneficiaryJson
                ? w.beneficiary
                : w.stranger;
          if (
            spellings(own.phone).includes(spelling) ||
            spellings(own.paymentNumber).includes(spelling)
          )
            continue;
          expect(json, `${person.label} ${spelling}`).not.toContain(spelling);
        }
      }
    }
  });

  it('contains no ledger hash, PIN hash, token, secret key or other member’s text', () => {
    for (const hash of w.chain.flatMap((tx) => [tx.hash, tx.prevHash]))
      expect(mineJson).not.toContain(hash);
    const keys: string[] = [];
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object')
        for (const [key, v] of Object.entries(value)) {
          keys.push(key);
          walk(v);
        }
    };
    walk(JSON.parse(mineJson));
    expect(
      keys.filter((k) =>
        /hash|token|pin|password|refresh|storageKey|fileKey|providerRef|phoneSnapshot/i.test(k),
      ),
    ).toEqual([]);
    expect(mineJson).not.toContain(OTHER_MARKER);
    expect(mineJson).not.toContain('argon2');
  });

  it('exports a secret vote as "voted" only: no choice, no totals, the time rounded to the hour', () => {
    const secretVotes = mine.votes.filter((v) => v.secret);
    expect(secretVotes).toEqual([
      {
        groupId: w.groupId,
        proposalType: 'MEMBER_REMOVE',
        secret: true,
        choice: null,
        votedAt: HOUR,
      },
    ]);
    expect(mine.votes.find((v) => !v.secret)).toMatchObject({ choice: 'YES' });
    expect(mine.votes).toHaveLength(2);
    // The other voter's ballot and the stored totals never appear, and no proposal id links to a ballot.
    expect(mineJson).not.toContain(secretProposalId);
    expect(mineJson).not.toMatch(/yesCount|noCount|"NO"/);
  });

  it('gives a stranger nothing of this group', () => {
    const body = (JSON.parse(strangerJson) as { export: DataExport }).export;
    dataExportSchema.parse(body);
    expect(body.groups.map((g) => g.groupId)).toEqual([w.strangerGroupId]);
    for (const part of [
      body.obligations,
      body.ledgerEntries,
      body.chatMessages,
      body.votes,
      body.assistantConversations,
      body.statements,
    ])
      expect(part).toEqual([]);
    expect(strangerJson).not.toContain(w.groupId);
    expect(strangerJson).not.toContain(w.groupName);
  });
});

describe('GET /v1/me/data-export: access, audit and limits', () => {
  it('is for signed-in members only and is never cached', async () => {
    expect((await stageApi(null).get('/v1/me/data-export')).status).toBe(401);
    const res = await exportOf(w.admin);
    expect(res.headers['cache-control']).toContain('no-store');
  });

  it('leaves an audit line with counts only', async () => {
    const line = await getPrisma().auditLog.findFirstOrThrow({
      where: { action: 'account.data.exported', actorUserId: w.lateMember.id },
    });
    const text = JSON.stringify(line.details);
    expect(JSON.parse(text)).toMatchObject({ groups: 1, obligations: 2, votes: 2 });
    expect(text).not.toContain(w.lateMember.name);
    expect(text).not.toContain(w.lateMember.phone);
  });

  it('is limited to five exports an hour per member', async () => {
    const user = await signUp();
    for (let i = 0; i < 5; i += 1)
      expect((await stageApi(user).get('/v1/me/data-export')).status).toBe(200);
    const sixth = await stageApi(user).get('/v1/me/data-export');
    expect(sixth.status).toBe(429);
    expect(sixth.body.code).toBe('RATE_LIMITED');
  });
});
