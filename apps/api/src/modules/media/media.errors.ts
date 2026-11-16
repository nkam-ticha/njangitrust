import { mediaErrorTexts as t } from '@njangi/shared/i18n/server/media';
import { defineErrors } from '../../lib/errors';
import type { MediaRefusal } from './media.rules';

export const mediaError = defineErrors({
  UNSUPPORTED_FILE_TYPE: { status: 415, text: t.UNSUPPORTED_FILE_TYPE },
  IMAGE_TOO_LARGE: { status: 413, text: t.IMAGE_TOO_LARGE },
  VIDEO_TOO_LARGE: { status: 413, text: t.VIDEO_TOO_LARGE },
  VOICE_TOO_LARGE: { status: 413, text: t.VOICE_TOO_LARGE },
  DOCUMENT_TOO_LARGE: { status: 413, text: t.DOCUMENT_TOO_LARGE },
  VIDEO_TOO_LONG: { status: 400, text: t.VIDEO_TOO_LONG },
  VOICE_TOO_LONG: { status: 400, text: t.VOICE_TOO_LONG },
  DURATION_REQUIRED: { status: 400, text: t.DURATION_REQUIRED },
  THUMBNAIL_ONLY_FOR_IMAGES: { status: 400, text: t.THUMBNAIL_ONLY_FOR_IMAGES },
  UPLOAD_TICKET_NOT_FOUND: { status: 404, text: t.UPLOAD_TICKET_NOT_FOUND },
  UPLOAD_TICKET_EXPIRED: { status: 410, text: t.UPLOAD_TICKET_EXPIRED },
  FILE_NOT_UPLOADED: { status: 409, text: t.FILE_NOT_UPLOADED },
  FILE_TYPE_MISMATCH: { status: 415, text: t.FILE_TYPE_MISMATCH },
  FILE_TOO_LARGE_RECEIVED: { status: 413, text: t.FILE_TOO_LARGE_RECEIVED },
  THUMBNAIL_INVALID: { status: 400, text: t.THUMBNAIL_INVALID },
  ATTACHMENT_NOT_FOUND: { status: 404, text: t.ATTACHMENT_NOT_FOUND },
});

/** Turns a rules refusal into the API error with the same code. */
export function refusalError(code: MediaRefusal) {
  return mediaError(code);
}
