// Storing a file the server itself made (a statement PDF). Phones upload with presigned URLs; the
// storage drivers have no "put" of their own, so the server writes straight to the local folder
// (development) or PUTs to its own presigned URL (S3). A key is never overwritten (spec 2.12).
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getStorage, LocalStorage } from '../../storage';

/** Writes `bytes` under `key`; throws if the object exists or the store refuses it. */
export async function putObject(
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const storage = getStorage();
  if (storage instanceof LocalStorage) {
    const target = storage.pathOf(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: 'wx' });
    return;
  }
  const upload = await storage.createUploadUrl({ key, contentType, maxBytes: bytes.length });
  const response = await fetch(upload.url, {
    method: upload.method,
    headers: upload.headers,
    body: Buffer.from(bytes),
  });
  if (!response.ok) throw new Error(`storage refused the upload (${response.status})`);
}
