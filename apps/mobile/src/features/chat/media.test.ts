// What a phone or a browser says about a file, turned into what the API accepts (spec 2.12, D24).
import { describe, expect, it } from 'vitest';
import { baseMime, clockLabel, formatBytes, kindForMime, voiceMime } from './media';

describe('mime types of picked and recorded files', () => {
  it('drops the codec parameters a browser adds', () => {
    expect(baseMime('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(baseMime('Audio/MP4')).toBe('audio/mp4');
    expect(baseMime(undefined)).toBe('');
  });

  it('names a recording by what it really is, defaulting to the phone format (m4a)', () => {
    expect(voiceMime('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(voiceMime('audio/ogg;codecs=opus')).toBe('audio/ogg');
    expect(voiceMime('audio/x-m4a')).toBe('audio/mp4');
    expect(voiceMime('audio/m4a')).toBe('audio/mp4');
    expect(voiceMime('')).toBe('audio/mp4');
    expect(voiceMime('application/octet-stream')).toBe('audio/mp4');
  });

  it('gives each picked file its kind, or none when the app does not take it', () => {
    expect(kindForMime('image/jpeg')).toBe('IMAGE');
    expect(kindForMime('image/heic')).toBe('IMAGE');
    expect(kindForMime('video/mp4')).toBe('VIDEO');
    expect(kindForMime('video/quicktime')).toBe('VIDEO');
    expect(kindForMime('application/pdf')).toBe('DOCUMENT');
    expect(kindForMime('application/zip')).toBeNull();
    expect(kindForMime('')).toBeNull();
  });
});

describe('labels', () => {
  it('shows sizes in Ko/Mo (fr) and KB/MB (en)', () => {
    expect(formatBytes(900, 'fr')).toBe('1 Ko');
    expect(formatBytes(240 * 1024, 'fr')).toBe('240 Ko');
    expect(formatBytes(240 * 1024, 'en')).toBe('240 KB');
    expect(formatBytes(3 * 1024 * 1024, 'fr')).toBe('3 Mo');
    expect(formatBytes(3.5 * 1024 * 1024, 'en')).toBe('3.5 MB');
  });

  it('shows a length as minutes and seconds', () => {
    expect(clockLabel(0)).toBe('0:00');
    expect(clockLabel(7)).toBe('0:07');
    expect(clockLabel(125)).toBe('2:05');
  });
});
