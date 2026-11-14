import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { advanceTestClock, resetTestClock, setTestClock } from '../lib/clock';
import { detectFileType } from './file-type';
import { LocalStorage } from './local-driver';
import { isValidStorageKey } from './storage.types';

const bytes = (...values: number[]) => Uint8Array.from(values);
const text = (s: string) => Uint8Array.from(Buffer.from(s, 'latin1'));

describe('file type detection (spec 2.12)', () => {
  it('recognises the accepted formats from their bytes', () => {
    expect(detectFileType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(detectFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(detectFileType(text('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(detectFileType(text('%PDF-1.7\n'))).toBe('application/pdf');
    expect(detectFileType(text('\0\0\0\x18ftypM4A \0\0\0\0'))).toBe('audio/mp4');
    expect(detectFileType(text('\0\0\0\x18ftypisom\0\0\0\0'))).toBe('video/mp4');
    expect(detectFileType(text('\0\0\0\x18ftypheic\0\0\0\0'))).toBe('image/heic');
  });

  it('does not trust names or declared types: a script is unknown', () => {
    expect(detectFileType(text('<script>alert(1)</script>'))).toBeNull();
    expect(detectFileType(text('MZ\x90\0'))).toBeNull();
  });
});

describe('storage keys', () => {
  it('accepts server-made keys and refuses traversal', () => {
    expect(isValidStorageKey('groups/abc-123/f1e2.jpg')).toBe(true);
    for (const bad of ['../etc/passwd', 'groups/../x', '/abs', 'groups//x', 'Groups/X', 'a\\b']) {
      expect(isValidStorageKey(bad)).toBe(false);
    }
  });
});

describe('local storage driver signatures (D2)', () => {
  afterEach(() => resetTestClock());

  async function driver() {
    return new LocalStorage(
      await mkdtemp(path.join(tmpdir(), 'njangi-store-')),
      's'.repeat(32),
      'http://api',
    );
  }

  function parse(url: string) {
    const u = new URL(url);
    const q = u.searchParams;
    const key = u.pathname.replace('/v1/storage/local/', '');
    return {
      request: {
        op: q.get('op') as 'put' | 'get',
        key,
        exp: Number(q.get('exp')),
        contentType: q.get('ct')!,
        maxBytes: Number(q.get('max')),
      },
      sig: q.get('sig')!,
    };
  }

  it('signs uploads for one key, type and size, for a short time', async () => {
    setTestClock(new Date('2026-11-02T10:00:00Z'));
    const store = await driver();
    const upload = await store.createUploadUrl({
      key: 'groups/g1/a.jpg',
      contentType: 'image/jpeg',
      maxBytes: 1000,
    });
    const { request, sig } = parse(upload.url);
    expect(store.verify(request, sig)).toBe(true);
    expect(store.verify({ ...request, maxBytes: 10_000_000 }, sig)).toBe(false);
    expect(store.verify({ ...request, contentType: 'text/html' }, sig)).toBe(false);
    expect(store.verify({ ...request, key: 'groups/g2/a.jpg' }, sig)).toBe(false);
    expect(store.verify({ ...request, op: 'get' }, sig)).toBe(false);
    advanceTestClock(11 * 60_000);
    expect(store.verify(request, sig)).toBe(false);
  });

  it('gives read URLs that expire after 5 minutes', async () => {
    setTestClock(new Date('2026-11-02T10:00:00Z'));
    const store = await driver();
    const download = await store.createDownloadUrl({ key: 'groups/g1/a.jpg' });
    expect(download.expiresAt.toISOString()).toBe('2026-11-02T10:05:00.000Z');
    const { request, sig } = parse(download.url);
    expect(store.verify(request, sig)).toBe(true);
    advanceTestClock(5 * 60_000 + 1);
    expect(store.verify(request, sig)).toBe(false);
  });

  it('never resolves a path outside its folder', async () => {
    const store = await driver();
    expect(() => store.pathOf('../outside.txt')).toThrow();
  });
});
