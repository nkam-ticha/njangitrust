// The configured storage driver (STORAGE_DRIVER, D2).
import { getEnv } from '../config/env';
import { LocalStorage } from './local-driver';
import { S3Storage } from './s3-driver';
import type { StorageProvider } from './storage.types';

let instance: StorageProvider | undefined;

export function getStorage(): StorageProvider {
  if (!instance) {
    const env = getEnv();
    instance =
      env.STORAGE_DRIVER === 's3'
        ? new S3Storage({
            endpoint: env.S3_ENDPOINT,
            region: env.S3_REGION,
            bucket: env.S3_BUCKET!,
            accessKey: env.S3_ACCESS_KEY!,
            secretKey: env.S3_SECRET_KEY!,
          })
        : new LocalStorage(env.STORAGE_LOCAL_DIR, env.STORAGE_SIGNING_SECRET!, env.PUBLIC_BASE_URL);
  }
  return instance;
}

export { detectFileType, SNIFF_BYTES, type DetectedType } from './file-type';
export { LocalStorage, LOCAL_STORAGE_ROUTE } from './local-driver';
export { S3Storage } from './s3-driver';
export * from './storage.types';
