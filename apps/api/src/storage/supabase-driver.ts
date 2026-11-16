// Supabase Storage driver. The service key stays on the API; clients receive only short-lived
// signed object URLs. The bucket must be private.
import { clock } from '../lib/clock';
import {
  assertStorageKey,
  DOWNLOAD_URL_TTL_SECONDS,
  UPLOAD_URL_TTL_SECONDS,
  type StorageProvider,
  type UploadUrl,
} from './storage.types';

export interface SupabaseStorageSettings {
  projectUrl: string;
  serviceRoleKey: string;
  bucket: string;
}

export class SupabaseStorage implements StorageProvider {
  readonly driver = 'supabase' as const;
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly bucket: string;

  constructor(settings: SupabaseStorageSettings) {
    this.baseUrl = `${settings.projectUrl.replace(/\/+$/, '')}/storage/v1`;
    this.bucket = settings.bucket;
    this.headers = {
      apikey: settings.serviceRoleKey,
      Authorization: `Bearer ${settings.serviceRoleKey}`,
    };
  }

  private objectPath(key: string): string {
    assertStorageKey(key);
    return `${this.baseUrl}/object/${encodeURIComponent(this.bucket)}/${key
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(path, {
      ...init,
      headers: { ...this.headers, ...init.headers },
    });
  }

  private async signedUrl(endpoint: string, body: unknown): Promise<string> {
    const response = await this.request(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Supabase Storage signing failed (${response.status})`);
    const data = (await response.json()) as { signedURL?: unknown; signedUrl?: unknown };
    const raw = data.signedURL ?? data.signedUrl;
    if (typeof raw !== 'string' || !raw) throw new Error('Supabase Storage returned no signed URL');
    return new URL(raw, `${this.baseUrl}/`).toString();
  }

  async createUploadUrl(input: {
    key: string;
    contentType: string;
    maxBytes: number;
    expiresInSeconds?: number;
  }): Promise<UploadUrl> {
    assertStorageKey(input.key);
    const expiresIn = input.expiresInSeconds ?? UPLOAD_URL_TTL_SECONDS;
    const url = await this.signedUrl(
      `/object/upload/sign/${encodeURIComponent(this.bucket)}/${input.key.split('/').map(encodeURIComponent).join('/')}`,
      { upsert: false },
    );
    // Supabase signed PUTs do not enforce a byte ceiling; the existing upload ticket flow checks
    // actual size and removes oversized files before accepting an attachment.
    return {
      url,
      method: 'PUT',
      headers: { 'Content-Type': input.contentType, 'x-upsert': 'false' },
      expiresAt: new Date(clock.nowMs() + expiresIn * 1000),
    };
  }

  async createDownloadUrl(input: { key: string; expiresInSeconds?: number }) {
    assertStorageKey(input.key);
    const expiresIn = input.expiresInSeconds ?? DOWNLOAD_URL_TTL_SECONDS;
    const url = await this.signedUrl(
      `/object/sign/${encodeURIComponent(this.bucket)}/${input.key.split('/').map(encodeURIComponent).join('/')}`,
      { expiresIn },
    );
    return { url, expiresAt: new Date(clock.nowMs() + expiresIn * 1000) };
  }

  async stat(key: string): Promise<{ sizeBytes: number } | null> {
    assertStorageKey(key);
    const response = await this.request(
      `${this.baseUrl}/object/info/${encodeURIComponent(this.bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`,
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Supabase Storage stat failed (${response.status})`);
    const data = (await response.json()) as { metadata?: { size?: unknown }; size?: unknown };
    const size = data.metadata?.size ?? data.size;
    if (typeof size !== 'number' || !Number.isFinite(size) || size < 0)
      throw new Error('Supabase Storage returned invalid object size');
    return { sizeBytes: size };
  }

  async readHead(key: string, bytes: number): Promise<Uint8Array | null> {
    assertStorageKey(key);
    if (!Number.isSafeInteger(bytes) || bytes < 1) throw new Error('Invalid byte count');
    const response = await this.request(this.objectPath(key), {
      headers: { Range: `bytes=0-${bytes - 1}` },
    });
    if (response.status === 404) return null;
    if (!response.ok && response.status !== 206)
      throw new Error(`Supabase Storage read failed (${response.status})`);
    return new Uint8Array(await response.arrayBuffer());
  }

  async remove(key: string): Promise<void> {
    const response = await this.request(this.objectPath(key), { method: 'DELETE' });
    if (!response.ok && response.status !== 404)
      throw new Error(`Supabase Storage delete failed (${response.status})`);
  }

  async check(): Promise<boolean> {
    try {
      const response = await this.request(
        `${this.baseUrl}/bucket/${encodeURIComponent(this.bucket)}`,
      );
      return response.ok;
    } catch {
      return false;
    }
  }
}
