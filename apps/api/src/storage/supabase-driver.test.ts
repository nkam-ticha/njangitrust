// The Supabase driver against the shapes Supabase Storage really answers with (storage-api):
// a signed upload comes back as { url, token } and a signed download as { signedURL }, both paths
// relative to /storage/v1. The links handed to phones must keep that prefix.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseStorage } from './supabase-driver';

const storage = new SupabaseStorage({
  projectUrl: 'https://abc.supabase.co/',
  serviceRoleKey: 'service-key',
  bucket: 'njangi-media',
});

function answer(body: unknown, status = 200) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('Supabase signed URLs', () => {
  it('turns a signed upload { url, token } into a full storage URL with the signed headers', async () => {
    const fetchMock = answer({
      url: '/object/upload/sign/njangi-media/groups/g/file.pdf?token=jwt',
      token: 'jwt',
    });
    const upload = await storage.createUploadUrl({
      key: 'groups/g/file.pdf',
      contentType: 'application/pdf',
      maxBytes: 1000,
    });
    expect(upload.url).toBe(
      'https://abc.supabase.co/storage/v1/object/upload/sign/njangi-media/groups/g/file.pdf?token=jwt',
    );
    expect(upload.method).toBe('PUT');
    expect(upload.headers).toMatchObject({ 'Content-Type': 'application/pdf' });
    expect(fetchMock.mock.calls[0]![0]).toBe(
      'https://abc.supabase.co/storage/v1/object/upload/sign/njangi-media/groups/g/file.pdf',
    );
  });

  it('turns a signed download { signedURL } into a full storage URL', async () => {
    answer({ signedURL: '/object/sign/njangi-media/groups/g/file.pdf?token=jwt' });
    const { url } = await storage.createDownloadUrl({ key: 'groups/g/file.pdf' });
    expect(url).toBe(
      'https://abc.supabase.co/storage/v1/object/sign/njangi-media/groups/g/file.pdf?token=jwt',
    );
  });

  it('also accepts a path that already starts with /storage/v1 or is absolute', async () => {
    answer({ signedURL: '/storage/v1/object/sign/njangi-media/a.pdf?token=t' });
    expect((await storage.createDownloadUrl({ key: 'groups/g/a.pdf' })).url).toBe(
      'https://abc.supabase.co/storage/v1/object/sign/njangi-media/a.pdf?token=t',
    );
    answer({ signedURL: 'https://abc.supabase.co/storage/v1/object/sign/x?token=t' });
    expect((await storage.createDownloadUrl({ key: 'groups/g/a.pdf' })).url).toBe(
      'https://abc.supabase.co/storage/v1/object/sign/x?token=t',
    );
  });

  it('fails clearly when Supabase gives no URL or refuses', async () => {
    answer({});
    await expect(
      storage.createUploadUrl({
        key: 'groups/g/a.pdf',
        contentType: 'application/pdf',
        maxBytes: 1,
      }),
    ).rejects.toThrow('no signed URL');
    answer({ error: 'nope' }, 400);
    await expect(storage.createDownloadUrl({ key: 'groups/g/a.pdf' })).rejects.toThrow('400');
  });
});
