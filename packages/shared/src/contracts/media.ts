// Chat media (spec 2.12, D9): photos, videos, documents and voice notes go straight from the phone
// to object storage with a presigned URL; the server then checks the real file type and size.
// Files are read back only through short-lived signed URLs, and only by current group members.
import { z } from 'zod';
import { instantSchema, uuidSchema } from './common';

export const attachmentKindSchema = z.enum(['IMAGE', 'VIDEO', 'DOCUMENT', 'VOICE']);
export type AttachmentKind = z.infer<typeof attachmentKindSchema>;

const MB = 1024 * 1024;

/** Spec 2.12: what each kind of file may weigh and last. Voice notes have no size cap in the spec. */
export const MEDIA_LIMITS = {
  IMAGE: { maxBytes: 10 * MB, maxDurationSec: null },
  VIDEO: { maxBytes: 50 * MB, maxDurationSec: 120 },
  /** A 3 minute AAC note at a low bitrate is well under 5 MB; 10 MB leaves room. */
  VOICE: { maxBytes: 10 * MB, maxDurationSec: 180 },
  DOCUMENT: { maxBytes: 20 * MB, maxDurationSec: null },
} as const satisfies Record<AttachmentKind, { maxBytes: number; maxDurationSec: number | null }>;

/** D9: the 320 px preview the phone uploads with a chat image. */
export const THUMBNAIL_MAX_BYTES = 300 * 1024;

/**
 * Types the phone may declare, by kind. A voice note can arrive in an MP4 or 3GP container whose
 * brand reads as video, so those are accepted for VOICE too; the declared type is never trusted,
 * the server reads the real one from the file's bytes.
 */
export const ACCEPTED_MIME = {
  IMAGE: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  VIDEO: ['video/mp4', 'video/quicktime', 'video/3gpp', 'video/webm'],
  VOICE: ['audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/ogg', 'video/mp4', 'video/3gpp'],
  DOCUMENT: ['application/pdf'],
} as const satisfies Record<AttachmentKind, readonly string[]>;

/** What a message shows of its file; never a URL (those are issued on demand and expire). */
export const attachmentSchema = z.strictObject({
  id: uuidSchema,
  kind: attachmentKindSchema,
  mime: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  durationSec: z.number().int().nonnegative().nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  /** D9: a small preview exists (images). */
  hasThumbnail: z.boolean(),
});
export type AttachmentDto = z.infer<typeof attachmentSchema>;

/** POST /groups/:id/attachments: ask for an upload slot. */
export const createUploadTicketRequestSchema = z.strictObject({
  kind: attachmentKindSchema,
  /** What the phone says the file is; checked against the kind now and against the bytes later. */
  mime: z.string().min(3).max(100),
  sizeBytes: z.number().int().positive(),
  /** Seconds, for video and voice notes. */
  durationSec: z.number().int().positive().optional(),
  width: z.number().int().positive().max(20_000).optional(),
  height: z.number().int().positive().max(20_000).optional(),
  /** D9: also get a slot for the 320 px preview (images). */
  withThumbnail: z.boolean().optional(),
});
export type CreateUploadTicketRequest = z.infer<typeof createUploadTicketRequestSchema>;

const uploadUrlSchema = z.strictObject({
  url: z.string(),
  method: z.literal('PUT'),
  /** Headers the phone must send with the file (the signed content type). */
  headers: z.record(z.string(), z.string()),
  expiresAt: instantSchema,
});

export const uploadTicketResponseSchema = z.strictObject({
  ticketId: uuidSchema,
  expiresAt: instantSchema,
  upload: uploadUrlSchema,
  thumbnailUpload: uploadUrlSchema.nullable(),
});
export type UploadTicketResponse = z.infer<typeof uploadTicketResponseSchema>;

/**
 * POST /groups/:id/attachments/:ticketId/complete: the file is in storage, check and register it.
 * The length and size of the picture are repeated here (the ticket does not keep them).
 */
export const completeUploadRequestSchema = z.strictObject({
  durationSec: z.number().int().positive().optional(),
  width: z.number().int().positive().max(20_000).optional(),
  height: z.number().int().positive().max(20_000).optional(),
});
export type CompleteUploadRequest = z.infer<typeof completeUploadRequestSchema>;

export const completeUploadResponseSchema = z.strictObject({ attachment: attachmentSchema });

/** GET /attachments/:id: the file's description and short-lived signed URLs (valid 5 minutes). */
export const attachmentAccessSchema = z.strictObject({
  attachment: attachmentSchema,
  url: z.string(),
  thumbnailUrl: z.string().nullable(),
  expiresAt: instantSchema,
});
export type AttachmentAccess = z.infer<typeof attachmentAccessSchema>;
