// Closing a meeting (R6.3, R15.5), the minutes draft and their publication (R15.4), and the reminder
// that goes out before a meeting (NOT-02).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { paymentReceivedPostings } from '@njangi/rules';
import { minutesDraftResponseSchema, minutesListSchema } from '@njangi/shared/contracts/meetings';
import { getPrisma } from '../../lib/prisma';
import { notify } from '../notifications';
import {
  recordLedgerEvents,
  stopRecordingLedgerEvents,
  type LedgerEventInput,
} from '../proposals/governance-ports';
import { chatWorld, type ChatWorld } from '../../../test/helpers/chat-world';
import type { TestUser } from '../../../test/helpers/client';
import { appendLedger, entryOf } from '../../../test/helpers/ledger-seed';
import {
  insertMeeting,
  installFakeMeetingMoney,
  setAbsenceFine,
  type FakeMeetingMoney,
} from '../../../test/helpers/meeting-helpers';
import { confirmCard, stageApi } from '../../../test/helpers/stage-client';
import { meetingReminders } from './meetings.jobs';
import { readVersions, versionIsIntact } from './minutes-store';

let w: ChatWorld;
let money: FakeMeetingMoney;
beforeAll(async () => {
  w = await chatWorld();
  money = installFakeMeetingMoney();
});
afterAll(() => {
  money.fines.length = 0;
});

const act = (user: TestUser, id: string, path: string, body?: unknown) =>
  stageApi(user).post(`/v1/meetings/${id}/${path}`, body);
const meetingRow = (id: string) => getPrisma().meeting.findUniqueOrThrow({ where: { id } });

/** Lets time pass: the meeting started a minute ago, and its attendance rows are older than that. */
async function startNow(id: string) {
  const prisma = getPrisma();
  await prisma.meeting.update({
    where: { id },
    data: { scheduledAt: new Date(Date.now() - 60_000) },
  });
  await prisma.attendance.updateMany({
    where: { meetingId: id },
    data: { createdAt: new Date(Date.now() - 3_600_000) },
  });
}

/** A meeting where Bea and the admin checked in, Carl excused himself and Dina did nothing. */
async function heldMeeting(): Promise<string> {
  const id = await insertMeeting(w.groupId, 30);
  expect((await act(w.bea, id, 'check-in')).status).toBe(200);
  expect((await act(w.admin, id, 'check-in')).status).toBe(200);
  expect((await act(w.carl, id, 'excuse', { reason: 'Je suis malade' })).status).toBe(200);
  await startNow(id);
  return id;
}

describe('closing a meeting (R6.3, R15.5)', () => {
  it('fines only the members absent without an excuse sent before the start, through the money port', async () => {
    await setAbsenceFine(w.groupId, 2_000);
    const id = await heldMeeting();
    const card = await act(w.admin, id, 'close');
    expect(card.status).toBe(201);
    expect(card.body.action.type).toBe('MEETING_CLOSE');
    expect(JSON.stringify(card.body.action.preview.notes)).toMatch(/2.000.FCFA/);
    expect(money.fines).toEqual([]);

    expect((await confirmCard(w.admin, card.body.action.id)).status).toBe(200);
    expect(money.fines).toEqual([
      { groupId: w.groupId, meetingId: id, amount: 2_000, membershipIds: [w.dina.membershipId] },
    ]);
    expect((await meetingRow(id)).status).toBe('HELD');
    const rows = await getPrisma().attendance.findMany({ where: { meetingId: id } });
    expect(rows).toHaveLength(4);
    const list = await stageApi(w.bea).get(`/v1/meetings/${id}/attendance`);
    const status = (m: TestUser & { membershipId: string }) =>
      list.body.attendance.find(
        (r: { member: { membershipId: string } }) => r.member.membershipId === m.membershipId,
      ).status;
    expect([status(w.bea), status(w.admin), status(w.carl), status(w.dina)]).toEqual([
      'PRESENT',
      'PRESENT',
      'EXCUSED',
      'ABSENT',
    ]);
    const view = (await stageApi(w.dina).get(`/v1/meetings/${id}`)).body.meeting;
    expect(view.counts).toEqual({ present: 2, excused: 1, absent: 1 });
    expect(view.me).toMatchObject({ status: 'ABSENT', canCheckIn: false });
    const again = await act(w.admin, id, 'close');
    expect(again.body.code).toBe('MEETING_ALREADY_CLOSED');
    expect((await act(w.bea, id, 'check-in')).body.code).toBe('MEETING_NOT_SCHEDULED');
  });

  it('assesses no fine when the rule is off', async () => {
    await setAbsenceFine(w.groupId, 0);
    const before = money.fines.length;
    const id = await heldMeeting();
    const card = await act(w.admin, id, 'close');
    expect(JSON.stringify(card.body.action.preview.notes)).not.toMatch(/FCFA/);
    await confirmCard(w.admin, card.body.action.id);
    expect(money.fines).toHaveLength(before);
  });

  it('cannot be closed before it starts, by a member, or by a stranger', async () => {
    const id = await insertMeeting(w.groupId, 120);
    expect((await act(w.admin, id, 'close')).body.code).toBe('MEETING_NOT_STARTED');
    expect((await act(w.bea, id, 'close')).status).toBe(403);
    expect((await act(w.stranger, id, 'close')).status).toBe(404);
  });
});

describe('the minutes draft (R15.4)', () => {
  it('is built from the agenda, the attendance, the payments and the events, plus the admin notes', async () => {
    const id = await heldMeeting();
    const now = new Date().toISOString();
    const pay = (payer: string) =>
      entryOf(
        'PAYMENT_RECEIVED',
        paymentReceivedPostings({
          payerMembershipId: payer,
          fee: 100,
          feeSource: 'SCHEDULE',
          parts: [
            {
              kind: 'CONTRIBUTION',
              amount: 10_000,
              creditorMembershipId: w.carl.membershipId,
              tieOrder: 1,
            },
            { kind: 'SOLIDARITY', amount: 1_000 },
          ],
        }),
        { membershipId: payer, occurredAt: now },
      );
    await appendLedger(w.groupId, [
      pay(w.bea.membershipId),
      pay(w.dina.membershipId),
      entryOf(
        'EVENT',
        { postings: [], metadata: { event: 'RULE_SET_APPLIED', version: 2, proposalId: null } },
        {
          descriptionFr: 'Nouvelle règle à partir du tour 5',
          descriptionEn: 'New rule from round 5',
          occurredAt: now,
        },
      ),
    ]);

    const res = await act(w.admin, id, 'minutes/draft', {
      notes: 'Penser à la caisse de secours.',
    });
    expect(res.status).toBe(200);
    const { draft } = minutesDraftResponseSchema.parse(res.body);
    expect(draft.language).toBe('fr');
    for (const part of [
      '## Présents',
      '## Excusés',
      '## Absents',
      '## Argent reçu',
      '## Événements du registre',
      '## Notes de l’admin',
    ]) {
      expect(draft.text).toContain(part);
    }
    expect(draft.text).toContain(w.bea.name);
    expect(draft.text).toMatch(/Excusés\n- /);
    expect(draft.text).toContain('2 paiement(s)');
    expect(draft.text).toMatch(/22.000.FCFA reçus au total/);
    expect(draft.text).toContain('Nouvelle règle à partir du tour 5');
    expect(draft.text).toContain('Penser à la caisse de secours.');
    expect(draft.text).not.toContain('Je suis malade');
    expect((await meetingRow(id)).minutesDraft).toBe(draft.text);
  });

  it('is for the admin, after the meeting has started', async () => {
    const early = await insertMeeting(w.groupId, 120);
    const refused = await act(w.admin, early, 'minutes/draft', {});
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('MEETING_NOT_STARTED');
    const started = await insertMeeting(w.groupId, -20);
    const asMember = await act(w.bea, started, 'minutes/draft', {});
    expect(asMember.status).toBe(403);
    expect(asMember.body.code).toBe('ADMIN_ONLY');
  });
});

describe('publishing the minutes (R15.4)', () => {
  let events: LedgerEventInput[];
  beforeAll(() => {
    events = recordLedgerEvents();
  });
  afterAll(() => stopRecordingLedgerEvents(events));

  it('needs a closed meeting, then records a ledger EVENT with the hash of the text', async () => {
    const id = await heldMeeting();
    const open = await act(w.admin, id, 'minutes/publish', {
      text: 'Procès-verbal de la réunion.',
    });
    expect(open.status).toBe(409);
    expect(open.body.code).toBe('MEETING_NOT_CLOSED');
    await confirmCard(w.admin, (await act(w.admin, id, 'close')).body.action.id);

    const card = await act(w.admin, id, 'minutes/publish', {
      text: 'Procès-verbal de la réunion.',
    });
    expect(card.status).toBe(201);
    expect(card.body.action.type).toBe('MEETING_PUBLISH_MINUTES');
    expect((await meetingRow(id)).minutesVersion).toBe(0);
    expect((await confirmCard(w.admin, card.body.action.id)).status).toBe(200);

    const stored = await meetingRow(id);
    const [v1] = readVersions(stored.minutesPublished);
    expect(stored).toMatchObject({ minutesVersion: 1, minutesDraft: null });
    expect(v1).toMatchObject({
      version: 1,
      text: 'Procès-verbal de la réunion.',
      correctionReason: null,
      publishedByMembershipId: w.admin.membershipId,
    });
    expect(versionIsIntact(id, v1!)).toBe(true);
    const event = events.find((e) => e.refId === id)!;
    expect(event).toMatchObject({
      groupId: w.groupId,
      refType: 'Meeting',
      event: { event: 'MINUTES_PUBLISHED', meetingId: id, version: 1, minutesHash: v1!.hash },
    });
    const system = await getPrisma().message.findFirstOrThrow({
      where: { groupId: w.groupId, kind: 'SYSTEM' },
      orderBy: { createdAt: 'desc' },
    });
    expect(system.systemText).toMatchObject({
      fr: expect.stringContaining('Procès-verbal publié'),
    });
    const notice = await getPrisma().notification.findFirst({
      where: {
        userId: w.bea.id,
        deepLink: `/groups/${w.groupId}/meetings/${id}`,
        titleEn: 'Minutes published',
      },
    });
    expect(notice).not.toBeNull();
    expect(
      await getPrisma().notification.count({
        where: {
          userId: w.admin.id,
          titleEn: 'Minutes published',
          deepLink: `/groups/${w.groupId}/meetings/${id}`,
        },
      }),
    ).toBe(0);
  });

  it('never edits a published text: a correction is a new version with a reason', async () => {
    const id = await heldMeeting();
    await confirmCard(w.admin, (await act(w.admin, id, 'close')).body.action.id);
    await confirmCard(
      w.admin,
      (await act(w.admin, id, 'minutes/publish', { text: 'Version un' })).body.action.id,
    );

    const noReason = await act(w.admin, id, 'minutes/publish', { text: 'Version deux' });
    expect(noReason.status).toBe(400);
    expect(noReason.body.code).toBe('CORRECTION_REASON_REQUIRED');
    const same = await act(w.admin, id, 'minutes/publish', { text: 'Version un', reason: 'Rien' });
    expect(same.status).toBe(409);
    expect(same.body.code).toBe('MINUTES_UNCHANGED');

    const card = await act(w.admin, id, 'minutes/publish', {
      text: 'Version deux',
      reason: 'Faute de frappe dans le montant',
    });
    expect(JSON.stringify(card.body.action.preview.notes)).toContain('Faute de frappe');
    expect((await confirmCard(w.admin, card.body.action.id)).status).toBe(200);

    const list = minutesListSchema.parse(
      (await stageApi(w.carl).get(`/v1/meetings/${id}/minutes`)).body,
    );
    expect(list.versions.map((v) => v.version)).toEqual([2, 1]);
    expect(list.versions[0]).toMatchObject({
      text: 'Version deux',
      correctionReason: 'Faute de frappe dans le montant',
      publishedBy: { name: w.admin.name },
    });
    expect(list.versions[1]).toMatchObject({ text: 'Version un', correctionReason: null });
    expect(list.versions[0]!.hash).not.toBe(list.versions[1]!.hash);
    const stored = readVersions((await meetingRow(id)).minutesPublished);
    expect(stored.every((v) => versionIsIntact(id, v))).toBe(true);
    expect(
      events.filter((e) => e.refId === id).map((e) => (e.event as { version: number }).version),
    ).toEqual([1, 2]);
    expect((await stageApi(w.carl).get(`/v1/meetings/${id}`)).body.meeting.minutes.version).toBe(2);
  });

  it('is for the admin of the group only', async () => {
    const id = await heldMeeting();
    await confirmCard(w.admin, (await act(w.admin, id, 'close')).body.action.id);
    const member = await act(w.bea, id, 'minutes/publish', { text: 'Je publie' });
    expect(member.status).toBe(403);
    expect((await act(w.stranger, id, 'minutes/publish', { text: 'Je publie' })).status).toBe(404);
    expect((await stageApi(w.leaver).get(`/v1/meetings/${id}/minutes`)).status).toBe(403);
    expect((await stageApi(null).get(`/v1/meetings/${id}/minutes`)).status).toBe(401);
  });
});

describe('the reminder before a meeting (NOT-02)', () => {
  it('goes once to the members who have not checked in or excused themselves', async () => {
    const id = await insertMeeting(w.groupId, 50);
    await act(w.bea, id, 'check-in');
    await act(w.carl, id, 'excuse', { reason: 'Déplacement' });
    const mine = async () =>
      (await meetingReminders(new Date())).filter(
        (n) => n.groupId === w.groupId && n.deepLink?.endsWith(id),
      );
    const first = await mine();
    expect(first.map((n) => n.userId).sort()).toEqual([w.admin.id, w.dina.id].sort());
    expect(first[0]).toMatchObject({
      category: 'REMINDERS',
      title: { en: 'The meeting starts soon' },
    });
    await notify(first);
    expect(await mine()).toEqual([]);
  });

  it('is not sent for a meeting more than two hours away', async () => {
    const id = await insertMeeting(w.groupId, 5 * 60);
    const out = (await meetingReminders(new Date())).filter((n) => n.deepLink?.endsWith(id));
    expect(out).toEqual([]);
  });
});
