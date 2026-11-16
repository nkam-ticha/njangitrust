// Small fake files with the first bytes of the real formats, and the whole upload flow of the app:
// ask for a slot, PUT the file to its signed URL, complete it.
import request from 'supertest';
import {
  attachmentAccessSchema,
  attachmentSchema,
  type AttachmentDto,
  type CreateUploadTicketRequest,
} from '@njangi/shared/contracts/media';
import type { TestUser } from './client';
import { stageApi } from './stage-client';
import { stageApp } from './stage-app';

const pad = (head: Buffer, size = 64) =>
  Buffer.concat([head, Buffer.alloc(Math.max(0, size - head.length))]);

export const FILES = {
  jpeg: () => pad(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])),
  png: () => pad(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  pdf: () => pad(Buffer.from('%PDF-1.7\n', 'latin1')),
  mp4: () => pad(Buffer.from('\0\0\0\x18ftypisom\0\0\0\0isomiso2', 'latin1')),
  m4a: () => pad(Buffer.from('\0\0\0\x18ftypM4A \0\0\0\0M4A mp42', 'latin1')),
  html: () => Buffer.from('<script>alert(1)</script>', 'latin1'),
} as const;

export interface UploadOptions {
  kind: CreateUploadTicketRequest['kind'];
  mime: string;
  bytes: Buffer;
  durationSec?: number;
  thumbnail?: Buffer;
}

/** The ticket step: returns the response of POST /groups/:id/attachments. */
export function askForSlot(user: TestUser, groupId: string, options: UploadOptions) {
  return stageApi(user).post(`/v1/groups/${groupId}/attachments`, {
    kind: options.kind,
    mime: options.mime,
    sizeBytes: options.bytes.length,
    ...(options.durationSec ? { durationSec: options.durationSec } : {}),
    ...(options.thumbnail ? { withThumbnail: true } : {}),
  });
}

/** PUTs bytes to a signed upload URL of the local storage driver. */
export function putToSlot(upload: { url: string; headers: Record<string, string> }, bytes: Buffer) {
  const target = new URL(upload.url);
  let req = request(stageApp()).put(`${target.pathname}${target.search}`);
  for (const [name, value] of Object.entries(upload.headers)) req = req.set(name, value);
  return req.send(bytes);
}

/** Ask, upload, complete: the app's flow. Returns the attachment (or the failing response). */
export async function uploadFile(
  user: TestUser,
  groupId: string,
  options: UploadOptions,
): Promise<AttachmentDto> {
  const slot = await askForSlot(user, groupId, options);
  if (slot.status !== 201) throw new Error(`no slot: ${slot.status} ${JSON.stringify(slot.body)}`);
  const put = await putToSlot(slot.body.upload, options.bytes);
  if (put.status !== 204) throw new Error(`upload refused: ${put.status}`);
  if (options.thumbnail) await putToSlot(slot.body.thumbnailUpload, options.thumbnail);
  const done = await stageApi(user).post(
    `/v1/groups/${groupId}/attachments/${slot.body.ticketId}/complete`,
    options.durationSec ? { durationSec: options.durationSec } : {},
  );
  if (done.status !== 201)
    throw new Error(`not completed: ${done.status} ${JSON.stringify(done.body)}`);
  return attachmentSchema.parse(done.body.attachment);
}

export async function accessOf(user: TestUser, attachmentId: string) {
  const res = await stageApi(user).get(`/v1/attachments/${attachmentId}`);
  return { res, access: res.status === 200 ? attachmentAccessSchema.parse(res.body) : null };
}

/** GETs a signed download URL of the local storage driver. */
export function download(url: string) {
  const target = new URL(url);
  return request(stageApp()).get(`${target.pathname}${target.search}`);
}
