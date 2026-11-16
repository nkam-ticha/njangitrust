import { describe, expect, it } from 'vitest';
import type { CreateUploadTicketRequest } from '@njangi/shared/contracts/media';
import {
  durationRefusal,
  extensionFor,
  realTypeAccepted,
  sizeRefusal,
  ticketRefusal,
} from './media.rules';

const MB = 1024 * 1024;
const ask = (over: Partial<CreateUploadTicketRequest>): CreateUploadTicketRequest => ({
  kind: 'IMAGE',
  mime: 'image/jpeg',
  sizeBytes: 1 * MB,
  ...over,
});

describe('media limits (spec 2.12)', () => {
  it('accepts a photo up to 10 MB and refuses more', () => {
    expect(ticketRefusal(ask({ sizeBytes: 10 * MB }))).toBeNull();
    expect(ticketRefusal(ask({ sizeBytes: 10 * MB + 1 }))).toBe('IMAGE_TOO_LARGE');
  });

  it('accepts a video up to 50 MB and 2 minutes, and refuses more of either', () => {
    const video = ask({ kind: 'VIDEO', mime: 'video/mp4', sizeBytes: 50 * MB, durationSec: 120 });
    expect(ticketRefusal(video)).toBeNull();
    expect(ticketRefusal({ ...video, sizeBytes: 50 * MB + 1 })).toBe('VIDEO_TOO_LARGE');
    expect(ticketRefusal({ ...video, durationSec: 121 })).toBe('VIDEO_TOO_LONG');
    expect(ticketRefusal({ ...video, durationSec: undefined })).toBe('DURATION_REQUIRED');
  });

  it('accepts a voice note up to 3 minutes and refuses a longer one', () => {
    const voice = ask({ kind: 'VOICE', mime: 'audio/mp4', sizeBytes: 2 * MB, durationSec: 180 });
    expect(ticketRefusal(voice)).toBeNull();
    expect(ticketRefusal({ ...voice, durationSec: 181 })).toBe('VOICE_TOO_LONG');
  });

  it('accepts a PDF up to 20 MB and nothing else as a document', () => {
    const pdf = ask({ kind: 'DOCUMENT', mime: 'application/pdf', sizeBytes: 20 * MB });
    expect(ticketRefusal(pdf)).toBeNull();
    expect(ticketRefusal({ ...pdf, sizeBytes: 20 * MB + 1 })).toBe('DOCUMENT_TOO_LARGE');
    expect(ticketRefusal({ ...pdf, mime: 'application/msword' })).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it('refuses a type that does not belong to the kind, whatever its case', () => {
    expect(ticketRefusal(ask({ mime: 'text/html' }))).toBe('UNSUPPORTED_FILE_TYPE');
    expect(ticketRefusal(ask({ mime: 'IMAGE/JPEG' }))).toBeNull();
    expect(ticketRefusal(ask({ kind: 'VOICE', mime: 'image/png', durationSec: 5 }))).toBe(
      'UNSUPPORTED_FILE_TYPE',
    );
  });

  it('allows a preview only for photos (D9)', () => {
    expect(ticketRefusal(ask({ withThumbnail: true }))).toBeNull();
    expect(
      ticketRefusal(ask({ kind: 'DOCUMENT', mime: 'application/pdf', withThumbnail: true })),
    ).toBe('THUMBNAIL_ONLY_FOR_IMAGES');
  });

  it('checks size and duration on their own', () => {
    expect(sizeRefusal('IMAGE', 1)).toBeNull();
    expect(durationRefusal('IMAGE', undefined)).toBeNull();
    expect(durationRefusal('VOICE', 180)).toBeNull();
  });

  it('reads the real type: a voice note may arrive in an MP4 container', () => {
    expect(realTypeAccepted('VOICE', 'video/mp4')).toBe(true);
    expect(realTypeAccepted('VOICE', 'audio/mp4')).toBe(true);
    expect(realTypeAccepted('VIDEO', 'audio/mp4')).toBe(false);
    expect(realTypeAccepted('IMAGE', 'application/pdf')).toBe(false);
    expect(realTypeAccepted('DOCUMENT', null)).toBe(false);
  });

  it('picks the storage extension from the type, never from a name', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg');
    expect(extensionFor('audio/mp4')).toBe('m4a');
    expect(extensionFor('application/x-unknown')).toBe('bin');
  });
});
