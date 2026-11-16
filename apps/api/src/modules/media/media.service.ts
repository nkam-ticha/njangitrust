// Chat media (spec 2.12, D9). The phone asks for an upload slot (an UploadTicket), sends the file
// straight to object storage, then asks the server to complete it: only then, after the real file
// type and size have been checked from the stored bytes, does an Attachment exist. Files are read
// back through signed URLs valid 5 minutes, issued only to current members of the group.
import type {
  AttachmentAccess,
  AttachmentDto,
  CompleteUploadRequest,
  CreateUploadTicketRequest,
  UploadTicketResponse,
} from '@njangi/shared/contracts/media';
import { THUMBNAIL_MAX_BYTES, MEDIA_LIMITS } from '@njangi/shared/contracts/media';
import { clock } from '../../lib/clock';
import { newId } from '../../lib/crypto';
import { componentLogger } from '../../lib/logger';
import { getPrisma, withTransaction } from '../../lib/prisma';
import { authorizeGroup } from '../../permissions';
import { toAttachment } from '../../dto/chat';
import { consumeOrThrow, lazyLimiter } from '../../http/rate-limit';
import { detectFileType, getStorage, SNIFF_BYTES, UPLOAD_URL_TTL_SECONDS } from '../../storage';
import { mediaError, refusalError } from './media.errors';
import {
  durationRefusal,
  extensionFor,
  realTypeAccepted,
  sizeRefusal,
  THUMBNAIL_TYPES,
  ticketRefusal,
} from './media.rules';

const log = componentLogger('media');

/** A member may ask for 60 upload slots an hour: far more than a person sends by hand. */
const ticketLimiter = lazyLimiter(
  { name: 'upload-ticket-user', points: 60, durationSeconds: 3600 },
  { scaled: true },
);

/** The signed upload URL is valid 10 minutes; a completion is still accepted a little later. */
const COMPLETE_GRACE_MS = 10 * 60_000;

const THUMBNAIL_CONTENT_TYPE = 'image/jpeg';

export async function createUploadTicket(
  userId: string,
  groupId: string,
  request: CreateUploadTicketRequest,
): Promise<UploadTicketResponse> {
  await authorizeGroup(userId, groupId, 'group.media.upload');
  const refusal = ticketRefusal(request);
  if (refusal) throw refusalError(refusal);
  await consumeOrThrow(ticketLimiter, userId);

  const storage = getStorage();
  const kind = request.kind;
  const declared = request.mime.toLowerCase();
  const storageKey = `groups/${groupId}/${newId()}.${extensionFor(declared)}`;
  const thumbnailKey = request.withThumbnail ? `groups/${groupId}/${newId()}-thumb.jpg` : null;
  const now = clock.now();
  const expiresAt = new Date(now.getTime() + UPLOAD_URL_TTL_SECONDS * 1000);

  const ticket = await getPrisma().uploadTicket.create({
    data: {
      userId,
      groupId,
      kind,
      declaredMime: declared,
      maxBytes: MEDIA_LIMITS[kind].maxBytes,
      storageKey,
      thumbnailKey,
      expiresAt,
    },
    select: { id: true },
  });
  const upload = await storage.createUploadUrl({
    key: storageKey,
    contentType: declared,
    maxBytes: MEDIA_LIMITS[kind].maxBytes,
  });
  const thumbnailUpload = thumbnailKey
    ? await storage.createUploadUrl({
        key: thumbnailKey,
        contentType: THUMBNAIL_CONTENT_TYPE,
        maxBytes: THUMBNAIL_MAX_BYTES,
      })
    : null;
  const dto = (u: typeof upload) => ({
    url: u.url,
    method: u.method,
    headers: u.headers,
    expiresAt: u.expiresAt.toISOString(),
  });
  return {
    ticketId: ticket.id,
    expiresAt: expiresAt.toISOString(),
    upload: dto(upload),
    thumbnailUpload: thumbnailUpload ? dto(thumbnailUpload) : null,
  };
}

/** Removes the stored objects of a refused upload, so nothing unchecked stays in the bucket. */
async function discard(keys: (string | null)[]): Promise<void> {
  const storage = getStorage();
  for (const key of keys) {
    if (!key) continue;
    try {
      await storage.remove(key);
    } catch (error) {
      log.warn({ err: error }, 'could not remove a refused upload');
    }
  }
}

/** D9: the preview is kept only if it is a small picture; a bad one is dropped, not fatal. */
async function checkedThumbnail(key: string | null): Promise<string | null> {
  if (!key) return null;
  const storage = getStorage();
  const stored = await storage.stat(key);
  if (!stored) return null;
  const head = await storage.readHead(key, SNIFF_BYTES);
  const type = head ? detectFileType(head) : null;
  if (stored.sizeBytes > THUMBNAIL_MAX_BYTES || !type || !THUMBNAIL_TYPES.includes(type)) {
    await discard([key]);
    return null;
  }
  return key;
}

export async function completeUpload(
  userId: string,
  groupId: string,
  ticketId: string,
  body: CompleteUploadRequest,
): Promise<AttachmentDto> {
  const access = await authorizeGroup(userId, groupId, 'group.media.upload');
  const prisma = getPrisma();
  const ticket = await prisma.uploadTicket.findUnique({ where: { id: ticketId } });
  if (!ticket || ticket.userId !== userId || ticket.groupId !== groupId) {
    throw mediaError('UPLOAD_TICKET_NOT_FOUND');
  }
  if (ticket.attachmentId) {
    const done = await prisma.attachment.findUnique({ where: { id: ticket.attachmentId } });
    if (done) return toAttachment(done);
  }
  if (clock.nowMs() > ticket.expiresAt.getTime() + COMPLETE_GRACE_MS) {
    throw mediaError('UPLOAD_TICKET_EXPIRED');
  }

  const storage = getStorage();
  const keys = [ticket.storageKey, ticket.thumbnailKey];
  const stored = await storage.stat(ticket.storageKey);
  if (!stored) throw mediaError('FILE_NOT_UPLOADED');
  // The size that arrived is checked, not the one the phone announced (spec 2.12).
  const tooLarge = sizeRefusal(ticket.kind, stored.sizeBytes);
  if (tooLarge) {
    await discard(keys);
    throw mediaError('FILE_TOO_LARGE_RECEIVED');
  }
  const head = await storage.readHead(ticket.storageKey, SNIFF_BYTES);
  const detected = head ? detectFileType(head) : null;
  if (!detected || !realTypeAccepted(ticket.kind, detected)) {
    await discard(keys);
    throw mediaError('FILE_TYPE_MISMATCH');
  }
  const tooLong = durationRefusal(ticket.kind, body.durationSec);
  if (tooLong) {
    await discard(keys);
    throw refusalError(tooLong);
  }
  const thumbnailKey = await checkedThumbnail(ticket.thumbnailKey);

  const created = await withTransaction(async (tx) => {
    const claimed = await tx.uploadTicket.updateMany({
      where: { id: ticket.id, completedAt: null },
      data: { completedAt: clock.now() },
    });
    if (claimed.count !== 1) return null;
    const attachment = await tx.attachment.create({
      data: {
        groupId,
        uploaderMembershipId: access.membership.id,
        kind: ticket.kind,
        mime: detected,
        sizeBytes: stored.sizeBytes,
        durationSec: body.durationSec ?? null,
        width: body.width ?? null,
        height: body.height ?? null,
        storageKey: ticket.storageKey,
        thumbnailKey,
      },
    });
    await tx.uploadTicket.update({
      where: { id: ticket.id },
      data: { attachmentId: attachment.id },
    });
    return attachment;
  });
  if (created) return toAttachment(created);
  // Another request completed the same ticket first: answer with its result.
  const again = await prisma.uploadTicket.findUniqueOrThrow({ where: { id: ticket.id } });
  const winner = again.attachmentId
    ? await prisma.attachment.findUnique({ where: { id: again.attachmentId } })
    : null;
  if (!winner) throw mediaError('UPLOAD_TICKET_NOT_FOUND');
  return toAttachment(winner);
}

/**
 * Spec 2.12: a file is readable by current members of its group only, through URLs that expire in
 * 5 minutes. A file nobody has posted yet is readable by whoever uploaded it; a file of a deleted
 * or hidden message is not readable by anyone.
 */
export async function getAttachmentAccess(
  userId: string,
  attachmentId: string,
): Promise<AttachmentAccess> {
  const attachment = await getPrisma().attachment.findUnique({
    where: { id: attachmentId },
    include: { message: { select: { deletedAt: true, hiddenByAdminAt: true } } },
  });
  if (!attachment) throw mediaError('ATTACHMENT_NOT_FOUND');
  const access = await authorizeGroup(userId, attachment.groupId, 'group.chat.read');
  const message = attachment.message;
  const removed =
    message !== null && (message.deletedAt !== null || message.hiddenByAdminAt !== null);
  const foreignDraft = message === null && attachment.uploaderMembershipId !== access.membership.id;
  if (removed || foreignDraft) throw mediaError('ATTACHMENT_NOT_FOUND');

  const storage = getStorage();
  const main = await storage.createDownloadUrl({ key: attachment.storageKey });
  const thumb = attachment.thumbnailKey
    ? await storage.createDownloadUrl({ key: attachment.thumbnailKey })
    : null;
  return {
    attachment: toAttachment(attachment),
    url: main.url,
    thumbnailUrl: thumb?.url ?? null,
    expiresAt: main.expiresAt.toISOString(),
  };
}

/** Deleting a message deletes its file (spec 2.12). Failures are logged: the row is already gone. */
export async function removeAttachmentFiles(files: {
  storageKey: string;
  thumbnailKey: string | null;
}): Promise<void> {
  await discard([files.storageKey, files.thumbnailKey]);
}
