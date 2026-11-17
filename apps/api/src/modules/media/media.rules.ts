// The limits and file-type checks of spec 2.12, as small pure functions the media service calls.
// Images 10 MB, video 50 MB and 2 minutes, voice notes 3 minutes, documents PDF up to 20 MB.
import {
  ACCEPTED_MIME,
  MEDIA_LIMITS,
  type AttachmentKind,
  type CreateUploadTicketRequest,
} from '@njangi/shared/contracts/media';
import type { DetectedType } from '../../storage';

/** The stable codes the media service turns into errors. */
export type MediaRefusal =
  | 'UNSUPPORTED_FILE_TYPE'
  | 'IMAGE_TOO_LARGE'
  | 'VIDEO_TOO_LARGE'
  | 'VOICE_TOO_LARGE'
  | 'DOCUMENT_TOO_LARGE'
  | 'VIDEO_TOO_LONG'
  | 'VOICE_TOO_LONG'
  | 'DURATION_REQUIRED'
  | 'THUMBNAIL_ONLY_FOR_IMAGES';

const TOO_LARGE: Record<AttachmentKind, MediaRefusal> = {
  IMAGE: 'IMAGE_TOO_LARGE',
  VIDEO: 'VIDEO_TOO_LARGE',
  VOICE: 'VOICE_TOO_LARGE',
  DOCUMENT: 'DOCUMENT_TOO_LARGE',
};

const TOO_LONG: Partial<Record<AttachmentKind, MediaRefusal>> = {
  VIDEO: 'VIDEO_TOO_LONG',
  VOICE: 'VOICE_TOO_LONG',
};

/** The file's own length: required for video and voice notes, never above their limit. */
export function durationRefusal(
  kind: AttachmentKind,
  durationSec: number | undefined,
): MediaRefusal | null {
  const max = MEDIA_LIMITS[kind].maxDurationSec;
  if (max === null) return null;
  if (durationSec === undefined) return 'DURATION_REQUIRED';
  return durationSec > max ? (TOO_LONG[kind] ?? 'DURATION_REQUIRED') : null;
}

/** Whether a file of `bytes` is too heavy for its kind. */
export function sizeRefusal(kind: AttachmentKind, bytes: number): MediaRefusal | null {
  return bytes > MEDIA_LIMITS[kind].maxBytes ? TOO_LARGE[kind] : null;
}

/** What the phone asks for, checked before any upload slot is made. */
export function ticketRefusal(request: CreateUploadTicketRequest): MediaRefusal | null {
  const accepted: readonly string[] = ACCEPTED_MIME[request.kind];
  if (!accepted.includes(request.mime.toLowerCase())) return 'UNSUPPORTED_FILE_TYPE';
  if (request.withThumbnail && request.kind !== 'IMAGE') return 'THUMBNAIL_ONLY_FOR_IMAGES';
  return (
    sizeRefusal(request.kind, request.sizeBytes) ??
    durationRefusal(request.kind, request.durationSec)
  );
}

/** The types the real bytes of a file may have, by kind (see ACCEPTED_MIME for the containers). */
const REAL_TYPES: Record<AttachmentKind, readonly DetectedType[]> = {
  IMAGE: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  VIDEO: ['video/mp4', 'video/quicktime', 'video/3gpp', 'video/webm'],
  VOICE: [
    'audio/mp4',
    'audio/aac',
    'audio/mpeg',
    'audio/ogg',
    'video/mp4',
    'video/3gpp',
    'video/webm',
  ],
  DOCUMENT: ['application/pdf'],
};

/** Spec 2.12: the type read from the file's first bytes must be one the kind accepts. */
export function realTypeAccepted(kind: AttachmentKind, detected: DetectedType | null): boolean {
  return detected !== null && REAL_TYPES[kind].includes(detected);
}

/** D9: the preview of a chat image is a small picture in a common web format. */
export const THUMBNAIL_TYPES: readonly DetectedType[] = ['image/jpeg', 'image/png', 'image/webp'];

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/3gpp': '3gp',
  'video/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
};

/** The file extension of a storage key for a declared type (never taken from a file name). */
export function extensionFor(mime: string): string {
  return EXTENSIONS[mime.toLowerCase()] ?? 'bin';
}
