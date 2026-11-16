// The audit export (spec 2.14, FSD LED-04): the JSON passes the rules package's verifier, the CSV
// turns back into the same export, phone numbers leave only masked, secret ballots never leave, and
// only people who may read the ledger can download it.
import { beforeAll, describe, expect, it } from 'vitest';
import { verifyLedgerExport, type LedgerExport } from '@njangi/rules';
import { getPrisma } from '../../lib/prisma';
import { appendLedger, entryOf } from '../../../test/helpers/ledger-seed';
import { ledgerExportFromCsv } from '../../../test/helpers/ledger-csv-parse';
import { stageApi } from '../../../test/helpers/stage-client';
import { statementWorld, type StatementWorld } from '../../../test/helpers/statement-world';
import { ledgerExportCard } from './audit-export.service';
import { LEDGER_CSV_COLUMNS } from './ledger-csv';

let w: StatementWorld;
let secretProposalId: string;
let openProposalId: string;

beforeAll(async () => {
  w = await statementWorld();
  const prisma = getPrisma();
  const eligible = w.rotation.map((m) => m.membershipId);
  const base = {
    groupId: w.groupId,
    payload: {},
    proposerMembershipId: w.admin.membershipId,
    eligibleMembershipIds: eligible,
    thresholdKind: 'MAJORITY' as const,
    opensAt: new Date('2026-10-05T08:00:00.000Z'),
    closesAt: new Date('2026-10-08T08:00:00.000Z'),
  };
  const secret = await prisma.proposal.create({
    data: {
      ...base,
      type: 'MEMBER_REMOVE',
      secret: true,
      yesCount: 3,
      noCount: 1,
      status: 'PASSED',
    },
  });
  const open = await prisma.proposal.create({
    // Already closed, so the vote-closing job of other tests never picks it up.
    data: {
      ...base,
      type: 'FINE_WAIVER',
      secret: false,
      yesCount: 1,
      noCount: 1,
      status: 'EXPIRED',
      closedAt: base.closesAt,
    },
  });
  secretProposalId = secret.id;
  openProposalId = open.id;
  // A secret vote keeps receipts only (R11.5; the database itself refuses a ballot for it).
  await prisma.voteReceipt.create({
    data: { proposalId: secret.id, membershipId: w.bea.membershipId },
  });
  await prisma.ballot.createMany({
    data: [
      { proposalId: open.id, membershipId: w.bea.membershipId, choice: 'YES' },
      { proposalId: open.id, membershipId: w.carl.membershipId, choice: 'NO' },
    ],
  });
});

const exportUrl = (format?: string) =>
  `/v1/groups/${w.groupId}/ledger/export${format ? `?format=${format}` : ''}`;

async function jsonExport(): Promise<LedgerExport> {
  const res = await stageApi(w.carl).get(exportUrl('json'));
  expect(res.status).toBe(200);
  return res.body as LedgerExport;
}

describe('the JSON audit export (spec 2.14)', () => {
  it('passes the ledger verifier: hash chain, balances, draw, tallies, no phone number', async () => {
    const file = await jsonExport();
    const result = verifyLedgerExport(file);
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.summary).toMatchObject({
      groupId: w.groupId,
      transactions: w.chain.length,
      headSeq: w.chain.length,
      headHash: w.chain.at(-1)!.hash,
      // Four payments of 11 000 less a 100 fee each, less the withdrawal and its fee.
      cash: 4 * 10_900 - w.payoutTotal,
      solidarityFund: 4 * 991,
      inFlight: 0,
    });
    expect(file.transactions).toEqual(w.chain);
    expect(file.group).toEqual({ id: w.groupId, name: w.groupName });
  });

  it('is the default format and is sent as a file', async () => {
    const res = await stageApi(w.carl).get(exportUrl());
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['content-disposition']).toContain(`ledger-${w.groupId}.json`);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.format).toBe('njangitrust.ledger-export');
  });

  it('is detected as forged as soon as one amount is changed', async () => {
    const file = await jsonExport();
    const forged = structuredClone(file);
    forged.transactions[2]!.postings[0]!.amount += 1;
    const result = verifyLedgerExport(forged);
    expect(result.ok).toBe(false);
    expect(result.problems[0]!.seq).toBe(3);
  });

  it('lists every member with a masked payment number, even the one who downloads', async () => {
    const res = await stageApi(w.carl).get(exportUrl());
    const file = res.body as LedgerExport;
    expect(file.members).toHaveLength(6);
    for (const member of file.members) {
      expect(Object.keys(member).sort()).toEqual([
        'membershipId',
        'name',
        'paymentNumberMasked',
        'role',
        'status',
      ]);
      expect(member.paymentNumberMasked).toMatch(/^6•• •• •\d \d\d$/);
    }
    expect(file.members.find((m) => m.membershipId === w.admin.membershipId)!.role).toBe('ADMIN');
    expect(res.text).not.toContain(w.carl.paymentNumber.slice(-9));
  });

  it('gives rule set versions, the cycle with its draw seed and the rotation', async () => {
    const file = await jsonExport();
    expect(file.ruleSets.map((r) => r.version)).toEqual([1]);
    expect(file.ruleSets[0]!.params.reliabilityWindow).toBeGreaterThan(0);
    expect(file.cycles).toHaveLength(1);
    expect(file.cycles[0]).toMatchObject({
      number: 1,
      mode: 'FIXED',
      rotation: w.rotation.map((m) => m.membershipId),
    });
    expect(file.cycles[0]!.drawSeed).toMatch(/^[0-9a-f]{64}$/);
  });

  it('gives the tally of a secret vote and never who voted, and the ballots of an open vote', async () => {
    const res = await stageApi(w.carl).get(exportUrl());
    const file = res.body as LedgerExport;
    const secret = file.proposals.find((p) => p.id === secretProposalId)!;
    expect(secret).toMatchObject({
      secret: true,
      eligibleCount: 4,
      yesCount: 3,
      noCount: 1,
      status: 'PASSED',
      ballots: null,
    });
    const open = file.proposals.find((p) => p.id === openProposalId)!;
    expect(open.ballots).toEqual([
      { membershipId: w.bea.membershipId, choice: 'YES' },
      { membershipId: w.carl.membershipId, choice: 'NO' },
    ]);
    expect(res.text).not.toContain('eligibleMembershipIds');
    expect(res.text).not.toContain('voteReceipts');
  });
});

describe('the CSV audit export (FSD LED-04)', () => {
  it('is a UTF-8 spreadsheet file with one row per posting', async () => {
    const res = await stageApi(w.carl).get(exportUrl('csv'));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain(`ledger-${w.groupId}.csv`);
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    const lines = res.text.slice(1).split('\r\n');
    expect(lines[0]).toBe(LEDGER_CSV_COLUMNS.join(','));
    expect(lines[1]!.startsWith('context,')).toBe(true);
    const postings = w.chain.reduce((n, tx) => n + tx.postings.length, 0);
    const events = w.chain.filter((tx) => tx.postings.length === 0).length;
    expect(lines.filter((l) => l.startsWith('posting,'))).toHaveLength(postings);
    expect(lines.filter((l) => l.startsWith('transaction,'))).toHaveLength(events);
    expect(res.text).not.toContain(w.carl.paymentNumber.slice(-9));
  });

  it('turns back into the same export and passes the verifier', async () => {
    const csv = (await stageApi(w.carl).get(exportUrl('csv'))).text;
    const file = await jsonExport();
    const parsed = ledgerExportFromCsv(csv);
    expect({ ...parsed, exportedAt: '' }).toEqual({ ...file, exportedAt: '' });
    const result = verifyLedgerExport(parsed);
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe('who may download the ledger (spec 2.11)', () => {
  it('lets a newcomer read it, but not a member who left, a stranger or a guest', async () => {
    expect((await stageApi(w.newcomer).get(exportUrl())).status).toBe(200);
    expect((await stageApi(w.leaver).get(exportUrl())).status).toBeGreaterThanOrEqual(403);
    expect((await stageApi(w.stranger).get(exportUrl('csv'))).status).toBeGreaterThanOrEqual(403);
    expect((await stageApi(null).get(exportUrl())).status).toBe(401);
  });

  it('refuses an unknown format', async () => {
    const res = await stageApi(w.carl).get(exportUrl('xlsx'));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('gives the agent tool a download card after the permission check, with no ledger data', async () => {
    expect(await ledgerExportCard(w.carl.id, w.groupId, 'csv')).toEqual({
      type: 'LEDGER_EXPORT',
      groupId: w.groupId,
      format: 'csv',
    });
    await expect(ledgerExportCard(w.stranger.id, w.groupId, 'json')).rejects.toMatchObject({
      status: expect.any(Number),
    });
  });
});

describe('a phone number that reached the ledger text', () => {
  it('is never sent: the export is withheld in both formats', async () => {
    const digits = ['6', '7', '7', '0', '0', '0', '1', '2', '3'].join('');
    await appendLedger(w.groupId, [
      entryOf('EVENT', [], {
        metadata: { event: 'NOTE' },
        descriptionFr: `Appeler le ${digits}`,
        descriptionEn: `Call ${digits}`,
      }),
    ]);
    for (const format of ['json', 'csv']) {
      const res = await stageApi(w.carl).get(exportUrl(format));
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('EXPORT_NOT_AVAILABLE');
      expect(res.body.messageFr).toBeTruthy();
      expect(res.body.messageEn).toBeTruthy();
      expect(res.text).not.toContain(digits);
    }
  });
});
