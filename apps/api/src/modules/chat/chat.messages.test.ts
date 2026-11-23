// Group chat messages (spec 1.5, 2.7 Chat, 4.4, CHT-01, CHT-02): posting, replies, mentions, the
// `@njangi` call to the agent, idempotent offline sends, pagination, permissions, media messages.
import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  chatMessageSchema,
  messageListSchema,
  messageResponseSchema,
} from '@njangi/shared/contracts/chat-messages';
import { getPrisma } from '../../lib/prisma';
import { recordRealtimeEvents, stopRecording } from '../../realtime/emitter';
import { getStorage } from '../../storage';
import type { TestUser } from '../../../test/helpers/client';
import { signUp, createGroup } from '../../../test/helpers/factories';
import { chatWorld, type ChatWorld, type Member } from '../../../test/helpers/chat-world';
import { FILES, uploadFile } from '../../../test/helpers/media-files';
import { stageApi } from '../../../test/helpers/stage-client';
import { registerAgentPort, resetAgentPortForTests, type GroupMention } from './agent-port';

let world: ChatWorld;
let groupId: string;
let admin: Member;
let bea: Member;
let carl: Member;

beforeAll(async () => {
  world = await chatWorld();
  ({ groupId, admin, bea, carl } = world);
});

const post = (user: TestUser, body: Record<string, unknown>, group = groupId) =>
  stageApi(user).post(`/v1/groups/${group}/messages`, body);

afterEach(() => resetAgentPortForTests());

describe('posting a message', () => {
  it('stores it, answers with the message and tells the group in real time', async () => {
    const events = recordRealtimeEvents();
    try {
      const res = await post(bea, { text: 'Bonjour tout le monde' });
      expect(res.status).toBe(201);
      const { message } = messageResponseSchema.parse(res.body);
      expect(message).toMatchObject({
        kind: 'TEXT',
        text: 'Bonjour tout le monde',
        author: { membershipId: bea.membershipId },
        attachment: null,
        replyTo: null,
        removed: null,
        isAnnouncement: false,
      });
      const sent = events.filter((e) => e.event === 'message.created');
      expect(sent.map((e) => e.room)).toContain(`group:${groupId}`);
      expect(sent.some((e) => (e.payload as { id: string }).id === message.id)).toBe(true);
    } finally {
      stopRecording(events);
    }
  });

  it('refuses an empty message, unknown fields and a phone number in the text', async () => {
    expect((await post(bea, {})).status).toBe(400);
    expect((await post(bea, { text: 'x', sender: 'someone' })).status).toBe(400);
    const phone = await post(bea, { text: 'Appelle-moi au 677 12 34 56' });
    expect(phone.status).toBe(400);
    expect(JSON.stringify(phone.body.details)).toContain('TEXT_CONTAINS_PHONE');
  });

  it('is idempotent with a client id: a queued message sent twice is stored once', async () => {
    const id = randomUUID();
    const first = await post(bea, { id, text: 'Envoyé hors ligne' });
    const second = await post(bea, { id, text: 'Envoyé hors ligne' });
    expect([first.status, second.status]).toEqual([201, 200]);
    expect(second.body.message.id).toBe(id);
    expect(await getPrisma().message.count({ where: { id } })).toBe(1);
    const stolen = await post(carl, { id, text: 'Le même identifiant' });
    expect(stolen.status).toBe(409);
    expect(stolen.body.code).toBe('MESSAGE_ID_TAKEN');
  });

  it('quotes the message a reply answers, and refuses a target from another group', async () => {
    const original = await post(bea, { text: 'Qui apporte les chaises pour samedi ?' });
    const reply = await post(carl, { text: 'Moi', replyToId: original.body.message.id });
    expect(reply.status).toBe(201);
    expect(reply.body.message.replyTo).toMatchObject({
      id: original.body.message.id,
      preview: 'Qui apporte les chaises pour samedi ?',
      author: { membershipId: bea.membershipId },
    });
    const other = await signUp();
    const otherGroup = await createGroup(other);
    const foreign = await stageApi(other).post(`/v1/groups/${otherGroup.groupId}/messages`, {
      text: 'ailleurs',
      replyToId: original.body.message.id,
    });
    expect(foreign.status).toBe(400);
    expect(foreign.body.code).toBe('REPLY_TARGET_INVALID');
  });

  it('keeps only members in the mentions', async () => {
    const ok = await post(bea, { text: '@Carl regarde', mentions: [carl.membershipId] });
    expect(ok.body.message.mentions).toEqual([carl.membershipId]);
    const stranger = await signUp();
    const foreignGroup = await createGroup(stranger);
    const bad = await post(bea, { text: 'hey', mentions: [foreignGroup.adminMembershipId] });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('MENTION_NOT_A_MEMBER');
  });
});

describe('@njangi (spec 4.4)', () => {
  it('stores the message, then calls the agent port with ids only', async () => {
    const calls: GroupMention[] = [];
    registerAgentPort({
      onGroupMention: (m) => {
        calls.push(m);
        return Promise.resolve();
      },
    });
    const res = await post(bea, { text: "@Njangi qui n'a pas encore payé ?" });
    expect(res.status).toBe(201);
    expect(calls).toEqual([
      {
        groupId,
        messageId: res.body.message.id,
        authorUserId: bea.id,
        authorMembershipId: bea.membershipId,
      },
    ]);
  });

  it('does not call the agent for a message that only looks like a mention', async () => {
    const calls: GroupMention[] = [];
    registerAgentPort({
      onGroupMention: (m) => {
        calls.push(m);
        return Promise.resolve();
      },
    });
    for (const text of ['a@njangi.org', '@njangiX salut', 'njangi sans arobase']) {
      expect((await post(bea, { text })).status).toBe(201);
    }
    expect(calls).toEqual([]);
  });

  it('returns the send without waiting for the agent, which answers in a request of its own', async () => {
    const answered: GroupMention[] = [];
    let release: () => void = () => undefined;
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    registerAgentPort({
      onGroupMention: () => Promise.resolve(),
      answerGroupMention: async (m) => {
        await slow;
        answered.push(m);
        return 'ANSWERED';
      },
    });
    const res = await post(bea, { text: '@njangi qui doit encore payer ?' });
    // The model has not even been asked: the send is already done.
    expect(res.status).toBe(201);
    expect(answered).toEqual([]);

    const asking = stageApi(bea).post(
      `/v1/groups/${groupId}/messages/${res.body.message.id}/agent-reply`,
      {},
    );
    release();
    const reply = await asking;
    expect(reply.status).toBe(200);
    expect(reply.body).toEqual({ status: 'ANSWERED' });
    expect(answered).toEqual([
      {
        groupId,
        messageId: res.body.message.id,
        authorUserId: bea.id,
        authorMembershipId: bea.membershipId,
      },
    ]);
  });

  it('lets only the author ask for the answer, and only for a message that calls the agent', async () => {
    const calls: GroupMention[] = [];
    registerAgentPort({
      onGroupMention: () => Promise.resolve(),
      answerGroupMention: (m) => {
        calls.push(m);
        return Promise.resolve('ANSWERED');
      },
    });
    const mine = await post(bea, { text: '@njangi bonjour' });
    const plain = await post(bea, { text: 'sans appel' });
    const url = (id: string) => `/v1/groups/${groupId}/messages/${id}/agent-reply`;
    const stolen = await stageApi(carl).post(url(mine.body.message.id), {});
    expect(stolen.status).toBe(403);
    expect(stolen.body.code).toBe('NOT_YOUR_MESSAGE');
    const notACall = await stageApi(bea).post(url(plain.body.message.id), {});
    expect(notACall.body).toEqual({ status: 'UNAVAILABLE' });
    const missing = await stageApi(bea).post(url(randomUUID()), {});
    expect(missing.status).toBe(404);
    expect(calls).toEqual([]);
  });

  it('keeps the message when the agent port fails', async () => {
    registerAgentPort({ onGroupMention: () => Promise.reject(new Error('agent down')) });
    const res = await post(bea, { text: '@njangi bonjour' });
    expect(res.status).toBe(201);
    expect(await getPrisma().message.count({ where: { id: res.body.message.id } })).toBe(1);
  });
});

describe('reading the thread', () => {
  it('pages newest first with a cursor and loses nothing', async () => {
    const mine = [];
    for (let i = 0; i < 5; i += 1)
      mine.push((await post(carl, { text: `Page ${i}` })).body.message.id);
    const seen: string[] = [];
    let before: string | undefined;
    for (let guard = 0; guard < 100; guard += 1) {
      const res = await stageApi(bea).get(
        `/v1/groups/${groupId}/messages?limit=2${before ? `&before=${before}` : ''}`,
      );
      expect(res.status).toBe(200);
      const page = messageListSchema.parse(res.body);
      seen.push(...page.messages.map((m) => m.id));
      if (!page.nextBefore) break;
      before = page.nextBefore;
    }
    const inDatabase = await getPrisma().message.findMany({
      where: { groupId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    expect(seen).toEqual(inDatabase.map((m) => m.id));
    expect(seen.indexOf(mine[4])).toBeLessThan(seen.indexOf(mine[0]));
  });

  it('shows system events with their bilingual text and no author', async () => {
    const res = await stageApi(bea).get(`/v1/groups/${groupId}/messages?limit=100`);
    const system = (
      res.body.messages as { kind: string; systemText: unknown; author: unknown }[]
    ).filter((m) => m.kind === 'SYSTEM');
    expect(system.length).toBeGreaterThan(0);
    expect(system[0]!.author).toBeNull();
    expect(system[0]!.systemText).toEqual({ fr: expect.any(String), en: expect.any(String) });
  });

  it('refuses an unknown cursor and a malformed limit', async () => {
    expect(
      (await stageApi(bea).get(`/v1/groups/${groupId}/messages?before=${randomUUID()}`)).status,
    ).toBe(404);
    expect((await stageApi(bea).get(`/v1/groups/${groupId}/messages?limit=500`)).status).toBe(400);
  });
});

describe('who may read and write', () => {
  it('answers 404 to a stranger, 403 to a member who left, 401 to nobody', async () => {
    const list = `/v1/groups/${groupId}/messages`;
    expect((await stageApi(world.stranger).get(list)).status).toBe(404);
    expect((await stageApi(world.leaver).get(list)).status).toBe(403);
    expect((await post(world.leaver, { text: 'encore là ?' })).status).toBe(403);
    expect((await post(world.stranger, { text: 'hello' })).status).toBe(404);
    expect((await stageApi(null).get(list)).status).toBe(401);
  });

  it('lets a newcomer (INVITED) read the chat at once but not write until active (R12.1)', async () => {
    expect((await stageApi(world.newcomer).get(`/v1/groups/${groupId}/messages`)).status).toBe(200);
    const res = await post(world.newcomer, { text: 'Bonjour' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_ACTIVE_MEMBER');
  });
});

describe('media messages (spec 2.12)', () => {
  it('posts a photo with a caption; the file can be used once and only by its uploader', async () => {
    const photo = await uploadFile(bea, groupId, {
      kind: 'IMAGE',
      mime: 'image/jpeg',
      bytes: FILES.jpeg(),
    });
    const res = await post(bea, { attachmentId: photo.id, text: 'Le local' });
    expect(res.status).toBe(201);
    expect(chatMessageSchema.parse(res.body.message)).toMatchObject({
      kind: 'IMAGE',
      text: 'Le local',
      attachment: { id: photo.id, kind: 'IMAGE' },
    });
    expect((await post(bea, { attachmentId: photo.id })).body.code).toBe('ATTACHMENT_NOT_USABLE');
    const voice = await uploadFile(bea, groupId, {
      kind: 'VOICE',
      mime: 'audio/mp4',
      bytes: FILES.m4a(),
      durationSec: 12,
    });
    const stolen = await post(carl, { attachmentId: voice.id });
    expect(stolen.body.code).toBe('ATTACHMENT_NOT_USABLE');
    const note = await post(bea, { attachmentId: voice.id });
    expect(note.body.message).toMatchObject({ kind: 'VOICE', text: null });
    expect(note.body.message.attachment.durationSec).toBe(12);
  });

  it('deleting a message deletes its file and removes the message text', async () => {
    const doc = await uploadFile(carl, groupId, {
      kind: 'DOCUMENT',
      mime: 'application/pdf',
      bytes: FILES.pdf(),
    });
    const sent = await post(carl, { attachmentId: doc.id, text: 'Le règlement' });
    const row = await getPrisma().attachment.findUniqueOrThrow({ where: { id: doc.id } });
    expect(await getStorage().stat(row.storageKey)).not.toBeNull();
    const events = recordRealtimeEvents();
    try {
      expect((await stageApi(carl).delete(`/v1/messages/${sent.body.message.id}`)).status).toBe(
        204,
      );
      expect(events.some((e) => e.event === 'message.deleted')).toBe(true);
    } finally {
      stopRecording(events);
    }
    expect(await getStorage().stat(row.storageKey)).toBeNull();
    expect(await getPrisma().attachment.count({ where: { id: doc.id } })).toBe(0);
    const list = await stageApi(bea).get(`/v1/groups/${groupId}/messages?limit=100`);
    const gone = (
      list.body.messages as {
        id: string;
        removed: string | null;
        text: string | null;
        attachment: unknown;
      }[]
    ).find((m) => m.id === sent.body.message.id);
    expect(gone).toMatchObject({ removed: 'DELETED', text: null, attachment: null });
    expect((await stageApi(bea).get(`/v1/attachments/${doc.id}`)).status).toBe(404);
  });

  it('lets only the author delete a message, and only once', async () => {
    const sent = await post(bea, { text: 'À moi seule' });
    const id = sent.body.message.id as string;
    const other = await stageApi(carl).delete(`/v1/messages/${id}`);
    expect(other.status).toBe(403);
    expect(other.body.code).toBe('NOT_YOUR_MESSAGE');
    expect((await stageApi(admin).delete(`/v1/messages/${id}`)).status).toBe(403);
    expect((await stageApi(bea).delete(`/v1/messages/${id}`)).status).toBe(204);
    expect((await stageApi(bea).delete(`/v1/messages/${id}`)).body.code).toBe(
      'MESSAGE_ALREADY_REMOVED',
    );
  });
});
