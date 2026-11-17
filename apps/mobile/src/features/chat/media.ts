// What a phone or a browser says about a file, turned into what the media API accepts (spec 2.12).
// Pure helpers; the upload itself is in useAttachments.
import type { AttachmentKind } from '@njangi/shared/contracts/media';
import { ACCEPTED_MIME } from '@njangi/shared/contracts/media';
import type { Lang } from '@njangi/shared';

/** "audio/webm;codecs=opus" → "audio/webm": a browser adds codec parameters to what it records. */
export function baseMime(type: string | null | undefined): string {
  return (type ?? '').split(';')[0]!.trim().toLowerCase();
}

/**
 * The type to declare for a recording: what it really is when the API takes it (a browser records
 * WebM or Ogg), otherwise the phone format (m4a, AAC in an MP4 container).
 */
export function voiceMime(type: string | null | undefined): string {
  const mime = baseMime(type);
  if (mime === 'audio/x-m4a' || mime === 'audio/m4a') return 'audio/mp4';
  return (ACCEPTED_MIME.VOICE as readonly string[]).includes(mime) ? mime : 'audio/mp4';
}

/** The kind of a picked photo, video or document, or null when the app does not take it. */
export function kindForMime(type: string | null | undefined): AttachmentKind | null {
  const mime = baseMime(type);
  for (const kind of ['IMAGE', 'VIDEO', 'DOCUMENT'] as const) {
    if ((ACCEPTED_MIME[kind] as readonly string[]).includes(mime)) return kind;
  }
  return null;
}

/** "240 Ko" / "240 KB": file sizes read in kilo and mega bytes of 1024, one decimal at most. */
export function formatBytes(bytes: number, lang: Lang): string {
  const unit = lang === 'fr' ? { k: 'Ko', m: 'Mo' } : { k: 'KB', m: 'MB' };
  const mb = bytes / (1024 * 1024);
  const text = (n: number) => String(Math.round(n * 10) / 10);
  return mb >= 1 ? `${text(mb)} ${unit.m}` : `${Math.max(1, Math.round(bytes / 1024))} ${unit.k}`;
}

/** 125 → "2:05". */
export function clockLabel(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
