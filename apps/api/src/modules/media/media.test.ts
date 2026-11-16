// Chat media (spec 2.12, D9): upload slots, the real-type check after upload, thumbnails, signed
// URLs for current members only, and the permission of every endpoint.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { advanceTestClock, resetTestClock } from '../../lib/clock';
import { getPrisma } from '../../lib/prisma';
import type { LocalStorage } from '../../storage';
import { getStorage } from '../../storage';
import { buildWorld, type World } from '../../../test/helpers/permission-matrix';
import {
  accessOf,
  askForSlot,
  download,
  FILES,
  putToSlot,
  uploadFile,
} from '../../../test/helpers/media-files';
import { stageApi } from '../../../test/helpers/stage-client';

const MB = 1024 * 1024;
let world: World;

beforeAll(async () => {
  world = await buildWorld();
});

const stored = (key: string) => getStorage().stat(key);

describe('upload slots (spec 2.12)', () => {
  it('gives a signed slot for the file and, for a photo, one for its 320 px preview (D9)', async () => {
    const res = await askForSlot(world.member, world.groupId, {
      kind: 'IMAGE',
      mime: 'image/jpeg',
      bytes: FILES.jpeg(),
      thumbnail: FILES.jpeg(),
    });
    expect(res.status).toBe(201);
    expect(res.body.upload.method).toBe('PUT');
    expect(res.body.upload.headers['Content-Type']).toBe('image/jpeg');
    expect(res.body.thumbnailUpload.url).toContain('-thumb.jpg');
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it.each([
    [
      'a type that is not accepted',
      { kind: 'IMAGE', mime: 'text/html', sizeBytes: 10 },
      415,
      'UNSUPPORTED_FILE_TYPE',
    ],
    [
      'a photo above 10 MB',
      { kind: 'IMAGE', mime: 'image/jpeg', sizeBytes: 10 * MB + 1 },
      413,
      'IMAGE_TOO_LARGE',
    ],
    [
      'a video above 50 MB',
      { kind: 'VIDEO', mime: 'video/mp4', sizeBytes: 50 * MB + 1, durationSec: 30 },
      413,
      'VIDEO_TOO_LARGE',
    ],
    [
      'a video above 2 minutes',
      { kind: 'VIDEO', mime: 'video/mp4', sizeBytes: MB, durationSec: 121 },
      400,
      'VIDEO_TOO_LONG',
    ],
    [
      'a voice note above 3 minutes',
      { kind: 'VOICE', mime: 'audio/mp4', sizeBytes: MB, durationSec: 181 },
      400,
      'VOICE_TOO_LONG',
    ],
    [
      'a video without its length',
      { kind: 'VIDEO', mime: 'video/mp4', sizeBytes: MB },
      400,
      'DURATION_REQUIRED',
    ],
    [
      'a document that is not a PDF',
      { kind: 'DOCUMENT', mime: 'application/msword', sizeBytes: MB },
      415,
      'UNSUPPORTED_FILE_TYPE',
    ],
    [
      'a document above 20 MB',
      { kind: 'DOCUMENT', mime: 'application/pdf', sizeBytes: 20 * MB + 1 },
      413,
      'DOCUMENT_TOO_LARGE',
    ],
    [
      'a preview for a document',
      { kind: 'DOCUMENT', mime: 'application/pdf', sizeBytes: MB, withThumbnail: true },
      400,
      'THUMBNAIL_ONLY_FOR_IMAGES',
    ],
  ])('refuses %s with a bilingual error', async (_name, body, status, code) => {
    const res = await stageApi(world.member).post(`/v1/groups/${world.groupId}/attachments`, body);
    expect(res.status).toBe(status);
    expect(res.body.code).toBe(code);
    expect(res.body.messageFr).toBeTruthy();
    expect(res.body.messageEn).toBeTruthy();
  });

  it('refuses unknown fields and a body that is not a slot request', async () => {
    const res = await stageApi(world.member).post(`/v1/groups/${world.groupId}/attachments`, {
      kind: 'IMAGE',
      mime: 'image/jpeg',
      sizeBytes: 10,
      storageKey: 'groups/x/y.jpg',
    });
    expect(res.status).toBe(400);
  });
});

describe('completing an upload: the real file is checked', () => {
  it('registers a photo with its preview and reports what was stored', async () => {
    const bytes = FILES.jpeg();
    const attachment = await uploadFile(world.member, world.groupId, {
      kind: 'IMAGE',
      mime: 'image/jpeg',
      bytes,
      thumbnail: FILES.jpeg(),
    });
    expect(attachment).toMatchObject({
      kind: 'IMAGE',
      mime: 'image/jpeg',
      sizeBytes: bytes.length,
      hasThumbnail: true,
    });
  });

  it('reads the type from the bytes: a script sent as a photo is refused and deleted', async () => {
    const slot = await askForSlot(world.member, world.groupId, {
      kind: 'IMAGE',
      mime: 'image/jpeg',
      bytes: FILES.html(),
    });
    expect((await putToSlot(slot.body.upload, FILES.html())).status).toBe(204);
    const done = await stageApi(world.member).post(
      `/v1/groups/${world.groupId}/attachments/${slot.body.ticketId}/complete`,
      {},
    );
    expect(done.status).toBe(415);
    expect(done.body.code).toBe('FILE_TYPE_MISMATCH');
    const ticket = await getPrisma().uploadTicket.findUniqueOrThrow({
      where: { id: slot.body.ticketId },
    });
    expect(await stored(ticket.storageKey)).toBeNull();
    expect(ticket.attachmentId).toBeNull();
  });

  it('refuses a PDF sent as a voice note', async () => {
    const slot = await askForSlot(world.member, world.groupId, {
      kind: 'VOICE',
      mime: 'audio/mp4',
      bytes: FILES.pdf(),
      durationSec: 10,
    });
    await putToSlot(slot.body.upload, FILES.pdf());
    const done = await stageApi(world.member).post(
      `/v1/groups/${world.groupId}/attachments/${slot.body.ticketId}/complete`,
      { durationSec: 10 },
    );
    expect(done.body.code).toBe('FILE_TYPE_MISMATCH');
  });

  it('accepts a voice note in an MP4 container and checks its length again', async () => {
    const ok = await uploadFile(world.member, world.groupId, {
      kind: 'VOICE',
      mime: 'audio/mp4',
      bytes: FILES.mp4(),
      durationSec: 180,
    });
    expect(ok).toMatchObject({ kind: 'VOICE', durationSec: 180 });

    const slot = await askForSlot(world.member, world.groupId, {
      kind: 'VOICE',
      mime: 'audio/mp4',
      bytes: FILES.m4a(),
      durationSec: 60,
    });
    await putToSlot(slot.body.upload, FILES.m4a());
    const long = await stageApi(world.member).post(
      `/v1/groups/${world.groupId}/attachments/${slot.body.ticketId}/complete`,
      { durationSec: 600 },
    );
    expect(long.body.code).toBe('VOICE_TOO_LONG');
  });

  it('says so when the file never arrived', async () => {
    const slot = await askForSlot(world.member, world.groupId, {
      kind: 'DOCUMENT',
      mime: 'application/pdf',
      bytes: FILES.pdf(),
    });
    const done = await stageApi(world.member).post(
      `/v1/groups/${world.groupId}/attachments/${slot.body.ticketId}/complete`,
      {},
    );
    expect(done.status).toBe(409);
    expect(done.body.code).toBe('FILE_NOT_UPLOADED');
  });

  it('measures the size that arrived, not the one announced', async () => {
    const slot = await askForSlot(world.member, world.groupId, {
      kind: 'IMAGE',
      mime: 'image/jpeg',
      bytes: FILES.jpeg(),
    });
    const ticket = await getPrisma().uploadTicket.findUniqueOrThrow({
      where: { id: slot.body.ticketId },
    });
    const storage = getStorage() as LocalStorage;
    const big = Buffer.concat([FILES.jpeg(), Buffer.alloc(10 * MB)]);
    const target = storage.pathOf(ticket.storageKey);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, big);
    const done = await stageApi(world.member).post(
      `/v1/groups/${world.groupId}/attachments/${slot.body.ticketId}/complete`,
      {},
    );
    expect(done.status).toBe(413);
    expect(done.body.code).toBe('FILE_TOO_LARGE_RECEIVED');
    expect(await stored(ticket.storageKey)).toBeNull();
  });

  it('drops a preview that is not a small picture, without failing the upload', async () => {
    const attachment = await uploadFile(world.member, world.groupId, {
      kind: 'IMAGE',
      mime: 'image/jpeg',
      bytes: FILES.png(),
      thumbnail: FILES.html(),
    });
    expect(attachment.hasThumbnail).toBe(false);
  });

  it('is idempotent: completing twice answers with the same attachment', async () => {
    const slot = await askForSlot(world.member, world.groupId, {
      kind: 'DOCUMENT',
      mime: 'application/pdf',
      bytes: FILES.pdf(),
    });
    await putToSlot(slot.body.upload, FILES.pdf());
    const path = `/v1/groups/${world.groupId}/attachments/${slot.body.ticketId}/complete`;
    const first = await stageApi(world.member).post(path, {});
    const second = await stageApi(world.member).post(path, {});
    expect(second.status).toBe(201);
    expect(second.body.attachment.id).toBe(first.body.attachment.id);
  });

  it("does not let another member complete someone's ticket", async () => {
    const slot = await askForSlot(world.member, world.groupId, {
      kind: 'DOCUMENT',
      mime: 'application/pdf',
      bytes: FILES.pdf(),
    });
    await putToSlot(slot.body.upload, FILES.pdf());
    const done = await stageApi(world.admin).post(
      `/v1/groups/${world.groupId}/attachments/${slot.body.ticketId}/complete`,
      {},
    );
    expect(done.status).toBe(404);
    expect(done.body.code).toBe('UPLOAD_TICKET_NOT_FOUND');
  });

  it('refuses a ticket whose time is long past', async () => {
    const slot = await askForSlot(world.member, world.groupId, {
      kind: 'DOCUMENT',
      mime: 'application/pdf',
      bytes: FILES.pdf(),
    });
    await putToSlot(slot.body.upload, FILES.pdf());
    await getPrisma().uploadTicket.update({
      where: { id: slot.body.ticketId },
      data: { expiresAt: new Date(Date.now() - 3_600_000) },
    });
    const done = await stageApi(world.member).post(
      `/v1/groups/${world.groupId}/attachments/${slot.body.ticketId}/complete`,
      {},
    );
    expect(done.status).toBe(410);
    expect(done.body.code).toBe('UPLOAD_TICKET_EXPIRED');
  });
});

describe('reading a file back (spec 2.12)', () => {
  it('gives the uploader, then the group, signed URLs that serve the file and expire in 5 minutes', async () => {
    const attachment = await uploadFile(world.member, world.groupId, {
      kind: 'IMAGE',
      mime: 'image/jpeg',
      bytes: FILES.jpeg(),
      thumbnail: FILES.jpeg(),
    });
    const { access } = await accessOf(world.member, attachment.id);
    expect(access?.thumbnailUrl).toBeTruthy();
    const file = await download(access!.url);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/jpeg');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(new Date(access!.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(300_000 + 2_000);

    advanceTestClock(6 * 60_000);
    try {
      expect((await download(access!.url)).status).toBe(403);
    } finally {
      resetTestClock();
    }
  });

  it('keeps a file nobody has posted yet to its uploader', async () => {
    const attachment = await uploadFile(world.member, world.groupId, {
      kind: 'DOCUMENT',
      mime: 'application/pdf',
      bytes: FILES.pdf(),
    });
    expect((await accessOf(world.admin, attachment.id)).res.status).toBe(404);
    expect((await accessOf(world.member, attachment.id)).res.status).toBe(200);
  });

  it('refuses a stranger and a member who has left, and an unknown id', async () => {
    const attachment = await uploadFile(world.member, world.groupId, {
      kind: 'IMAGE',
      mime: 'image/png',
      bytes: FILES.png(),
    });
    const stranger = await accessOf(world.outsider, attachment.id);
    expect(stranger.res.status).toBe(404);
    const left = await accessOf(world.left, attachment.id);
    expect(left.res.status).toBe(403);
    expect(left.res.body.code).toBe('MEMBERSHIP_ENDED');
    const unknown = await accessOf(world.member, '00000000-0000-4000-8000-000000000000');
    expect(unknown.res.body.code).toBe('ATTACHMENT_NOT_FOUND');
    expect((await stageApi(null).get(`/v1/attachments/${attachment.id}`)).status).toBe(401);
  });
});

describe('who may ask for an upload slot', () => {
  const body = { kind: 'DOCUMENT', mime: 'application/pdf', sizeBytes: 100 };
  it('answers 201 to the member and the admin, 404 to a stranger, 403 to a member who left, 401 to nobody', async () => {
    const path = `/v1/groups/${world.groupId}/attachments`;
    expect((await stageApi(world.member).post(path, body)).status).toBe(201);
    expect((await stageApi(world.admin).post(path, body)).status).toBe(201);
    expect((await stageApi(world.outsider).post(path, body)).status).toBe(404);
    expect((await stageApi(world.left).post(path, body)).status).toBe(403);
    expect((await stageApi(null).post(path, body)).status).toBe(401);
  });
});
