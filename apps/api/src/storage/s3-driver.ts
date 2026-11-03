// S3 storage driver (spec 2.12, D2): any S3-compatible service; presigned PUT and GET URLs.
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { clock } from '../lib/clock';
import {
  assertStorageKey,
  DOWNLOAD_URL_TTL_SECONDS,
  UPLOAD_URL_TTL_SECONDS,
  type StorageProvider,
  type UploadUrl,
} from './storage.types';

export interface S3Settings {
  endpoint?: string | undefined;
  region?: string | undefined;
  bucket: string;
  accessKey: string;
  secretKey: string;
}

export class S3Storage implements StorageProvider {
  readonly driver = 's3' as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(settings: S3Settings) {
    this.bucket = settings.bucket;
    this.client = new S3Client({
      region: settings.region ?? 'us-east-1',
      ...(settings.endpoint ? { endpoint: settings.endpoint, forcePathStyle: true } : {}),
      credentials: { accessKeyId: settings.accessKey, secretAccessKey: settings.secretKey },
    });
  }

  async createUploadUrl(input: { key: string; contentType: string; maxBytes: number; expiresInSeconds?: number }): Promise<UploadUrl> {
    assertStorageKey(input.key);
    const expiresIn = input.expiresInSeconds ?? UPLOAD_URL_TTL_SECONDS;
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: input.key, ContentType: input.contentType });
    const url = await getSignedUrl(this.client, command, { expiresIn, signableHeaders: new Set(['content-type']) });
    // Presigned PUTs can't cap the size; the size is checked after upload (stat) and oversized
    // objects are deleted before any attachment is created.
    return { url, method: 'PUT', headers: { 'Content-Type': input.contentType }, expiresAt: new Date(clock.nowMs() + expiresIn * 1000) };
  }

  async createDownloadUrl(input: { key: string; expiresInSeconds?: number }) {
    assertStorageKey(input.key);
    const expiresIn = input.expiresInSeconds ?? DOWNLOAD_URL_TTL_SECONDS;
    const url = await getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: input.key }), { expiresIn });
    return { url, expiresAt: new Date(clock.nowMs() + expiresIn * 1000) };
  }

  async stat(key: string) {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { sizeBytes: head.ContentLength ?? 0 };
    } catch {
      return null;
    }
  }

  async readHead(key: string, bytes: number) {
    try {
      const object = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }),
      );
      return object.Body ? await object.Body.transformToByteArray() : null;
    } catch {
      return null;
    }
  }

  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async check() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }
}
