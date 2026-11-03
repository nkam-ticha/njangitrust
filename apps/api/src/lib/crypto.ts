// Identifiers, random tokens and keyed hashes. Secrets come from the validated environment.
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { getEnv } from '../config/env';

/** A new UUID v4 for records whose id must be known before insert (ledger entries, actions). */
export function newId(): string {
  return randomUUID();
}

/** A URL-safe random token with `bytes` bytes of entropy (default 256 bits). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function hmacSha256Hex(key: string | Buffer, value: string): string {
  return createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

/** Constant-time comparison of two strings (hashes, signatures). */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

const derivedKeys = new Map<string, Buffer>();

/** A purpose-specific key derived with HKDF, so one secret never serves two purposes. */
function derivedKey(secret: string, purpose: string): Buffer {
  const cacheKey = `${purpose}:${sha256Hex(secret)}`;
  let key = derivedKeys.get(cacheKey);
  if (!key) {
    key = Buffer.from(hkdfSync('sha256', secret, 'njangitrust', purpose, 32));
    derivedKeys.set(cacheKey, key);
  }
  return key;
}

/**
 * Keyed hash of a phone number (invites, MEMBER_ADD proposals). Phone numbers have little entropy,
 * so a plain SHA-256 could be reversed; an HMAC with a server secret cannot.
 */
export function hashPhone(e164: string): string {
  const env = getEnv();
  return hmacSha256Hex(derivedKey(env.HASH_SECRET ?? env.JWT_REFRESH_SECRET, 'phone-hash'), e164);
}

/** Refresh tokens are stored as an HMAC: a database leak cannot be replayed. */
export function hashRefreshToken(token: string): string {
  return hmacSha256Hex(derivedKey(getEnv().JWT_REFRESH_SECRET, 'refresh-token'), token);
}

/** One-time link tokens (invites, PIN resets) have 256 bits of entropy; SHA-256 suffices. */
export function hashLinkToken(token: string): string {
  return sha256Hex(`njangitrust-link:${token}`);
}

const SEAL_VERSION = 'v1';

function sealKey(): Buffer {
  const env = getEnv();
  return derivedKey(env.HASH_SECRET ?? env.JWT_REFRESH_SECRET, 'action-seal');
}

/**
 * Encrypts a JSON value with AES-256-GCM (confidential pending actions, R11.5): a reader of the
 * database alone cannot see it. Format: `v1.<iv>.<tag>.<ciphertext>`, base64url.
 */
export function sealJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', sealKey(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [SEAL_VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

export function openJson(sealed: string): unknown {
  const [version, iv, tag, body] = sealed.split('.');
  if (version !== SEAL_VERSION || !iv || !tag || body === undefined) throw new Error('Malformed sealed value');
  const decipher = createDecipheriv('aes-256-gcm', sealKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  const text = Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
  return JSON.parse(text) as unknown;
}
