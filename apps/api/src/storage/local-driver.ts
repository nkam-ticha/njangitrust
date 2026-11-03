// Local storage driver (D2, development): files on disk under STORAGE_LOCAL_DIR, reached through
// short-lived URLs served by the API and signed with HMAC-SHA256 (operation, key, expiry, content
// type and size limit are all covered by the signature).
import { mkdir, open, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { hmacSha256Hex, safeEqual } from '../lib/crypto';
import { clock } from '../lib/clock';
import {
  assertStorageKey,
  DOWNLOAD_URL_TTL_SECONDS,
  UPLOAD_URL_TTL_SECONDS,
  type StorageProvider,
  type UploadUrl,
} from './storage.types';

export const LOCAL_STORAGE_ROUTE = '/v1/storage/local';

export interface SignedRequest {
  op: 'put' | 'get';
  key: string;
  /** Expiry, seconds since the epoch. */
  exp: number;
  contentType: string;
  maxBytes: number;
}

export class LocalStorage implements StorageProvider {
  readonly driver = 'local' as const;
  private readonly root: string;

  constructor(
    rootDir: string,
    private readonly signingSecret: string,
    private readonly publicBaseUrl: string,
  ) {
    this.root = path.resolve(rootDir);
  }

  /** Absolute path of a key, guaranteed to stay inside the storage folder. */
  pathOf(key: string): string {
    assertStorageKey(key);
    const full = path.resolve(this.root, ...key.split('/'));
    if (!full.startsWith(this.root + path.sep)) throw new Error('Storage key escapes the storage folder');
    return full;
  }

  signature(request: SignedRequest): string {
    const payload = [request.op, request.key, request.exp, request.contentType, request.maxBytes].join('\n');
    return hmacSha256Hex(this.signingSecret, payload);
  }

  /** True when the signature is valid and not expired. */
  verify(request: SignedRequest, sig: string): boolean {
    if (!Number.isSafeInteger(request.exp) || request.exp * 1000 <= clock.nowMs()) return false;
    return safeEqual(this.signature(request), sig);
  }

  private url(request: SignedRequest): string {
    const query = new URLSearchParams({
      op: request.op,
      exp: String(request.exp),
      ct: request.contentType,
      max: String(request.maxBytes),
      sig: this.signature(request),
    });
    return `${this.publicBaseUrl}${LOCAL_STORAGE_ROUTE}/${request.key}?${query.toString()}`;
  }

  async createUploadUrl(input: { key: string; contentType: string; maxBytes: number; expiresInSeconds?: number }): Promise<UploadUrl> {
    assertStorageKey(input.key);
    const exp = Math.floor(clock.nowMs() / 1000) + (input.expiresInSeconds ?? UPLOAD_URL_TTL_SECONDS);
    const request: SignedRequest = { op: 'put', key: input.key, exp, contentType: input.contentType, maxBytes: input.maxBytes };
    return { url: this.url(request), method: 'PUT', headers: { 'Content-Type': input.contentType }, expiresAt: new Date(exp * 1000) };
  }

  async createDownloadUrl(input: { key: string; expiresInSeconds?: number }) {
    assertStorageKey(input.key);
    const exp = Math.floor(clock.nowMs() / 1000) + (input.expiresInSeconds ?? DOWNLOAD_URL_TTL_SECONDS);
    return { url: this.url({ op: 'get', key: input.key, exp, contentType: '', maxBytes: 0 }), expiresAt: new Date(exp * 1000) };
  }

  async stat(key: string) {
    try {
      const info = await stat(this.pathOf(key));
      return info.isFile() ? { sizeBytes: info.size } : null;
    } catch {
      return null;
    }
  }

  async readHead(key: string, bytes: number) {
    try {
      const handle = await open(this.pathOf(key), 'r');
      try {
        const buffer = Buffer.alloc(bytes);
        const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
        return new Uint8Array(buffer.subarray(0, bytesRead));
      } finally {
        await handle.close();
      }
    } catch {
      return null;
    }
  }

  async remove(key: string) {
    await rm(this.pathOf(key), { force: true });
  }

  async ensureRoot(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  async check() {
    try {
      await this.ensureRoot();
      return (await stat(this.root)).isDirectory();
    } catch {
      return false;
    }
  }
}
