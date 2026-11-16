import { describe, expect, it } from 'vitest';
import { EnvError, listenHost, parseEnv } from './env';

const valid = {
  DATABASE_URL: 'postgresql://app:pw@localhost:5432/njangitrust',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'a'.repeat(48),
  JWT_REFRESH_SECRET: 'b'.repeat(48),
  CRON_SECRET: 'd'.repeat(48),
  STORAGE_SIGNING_SECRET: 'c'.repeat(32),
  PUBLIC_BASE_URL: 'http://localhost:3000',
  WEB_ORIGINS: 'http://localhost:8081, https://app.example.com/',
};

describe('environment (spec 2.16)', () => {
  it('parses a valid environment with defaults', () => {
    const env = parseEnv(valid);
    expect(env.PAYMENT_PROVIDER).toBe('mock');
    expect(env.APP_TIMEZONE).toBe('Africa/Douala');
    expect(env.PUBLIC_APP_URL).toBeUndefined();
    expect(env.WEB_ORIGINS).toEqual(['http://localhost:8081', 'https://app.example.com']);
    expect(env.FEE_SCHEDULE).toEqual({ collection: 100, disbursement: 500 });
  });

  it('fails fast, naming every bad variable but never printing a value', () => {
    const secret = 'short-secret-value';
    try {
      parseEnv({ ...valid, JWT_SECRET: secret, DATABASE_URL: undefined });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError);
      const message = (error as Error).message;
      expect(message).toContain('JWT_SECRET');
      expect(message).toContain('DATABASE_URL');
      expect(message).not.toContain(secret);
    }
  });

  it('refuses the same secret for access and refresh tokens', () => {
    expect(() => parseEnv({ ...valid, JWT_REFRESH_SECRET: valid.JWT_SECRET })).toThrow(
      /JWT_REFRESH_SECRET/,
    );
  });

  it('requires the S3 settings with the s3 driver and CamPay credentials with campay', () => {
    expect(() => parseEnv({ ...valid, STORAGE_DRIVER: 's3' })).toThrow(/S3_BUCKET/);
    expect(() => parseEnv({ ...valid, PAYMENT_PROVIDER: 'campay' })).toThrow(/CAMPAY_USERNAME/);
  });

  it('requires https and a hash secret in production', () => {
    expect(() => parseEnv({ ...valid, NODE_ENV: 'production' })).toThrow(
      /PUBLIC_BASE_URL[\s\S]*HASH_SECRET/,
    );
  });

  it('accepts LAN web origins in development but only https origins in production (D1)', () => {
    const lan = 'http://localhost:8081,http://192.168.1.20:8081';
    expect(parseEnv({ ...valid, WEB_ORIGINS: lan }).WEB_ORIGINS).toEqual([
      'http://localhost:8081',
      'http://192.168.1.20:8081',
    ]);
    expect(parseEnv({ ...valid, PUBLIC_APP_URL: 'http://192.168.1.20:8081' }).PUBLIC_APP_URL).toBe(
      'http://192.168.1.20:8081',
    );
    const production = {
      ...valid,
      NODE_ENV: 'production',
      PUBLIC_BASE_URL: 'https://api.example.com',
      HASH_SECRET: 'd'.repeat(48),
    };
    expect(() => parseEnv({ ...production, WEB_ORIGINS: lan })).toThrow(/WEB_ORIGINS/);
    expect(() =>
      parseEnv({
        ...production,
        PUBLIC_APP_URL: 'http://app.example.com',
        WEB_ORIGINS: 'https://app.example.com',
      }),
    ).toThrow(/PUBLIC_APP_URL/);
    expect(parseEnv({ ...production, WEB_ORIGINS: 'https://app.example.com' }).WEB_ORIGINS).toEqual(
      ['https://app.example.com'],
    );
  });

  it('keeps PUBLIC_APP_URL a bare origin: strips a trailing slash, refuses paths, queries and credentials', () => {
    expect(parseEnv({ ...valid, PUBLIC_APP_URL: 'http://192.168.1.20:8081/' }).PUBLIC_APP_URL).toBe(
      'http://192.168.1.20:8081',
    );
    for (const bad of [
      'http://localhost:8081/app',
      'http://localhost:8081/?token=1',
      'http://user:pw@localhost:8081',
      'ftp://localhost',
    ]) {
      expect(() => parseEnv({ ...valid, PUBLIC_APP_URL: bad })).toThrow(/PUBLIC_APP_URL/);
    }
  });

  it('listens on every interface in development only, unless HOST says otherwise', () => {
    expect(listenHost(parseEnv(valid))).toBeUndefined();
    expect(listenHost(parseEnv({ ...valid, NODE_ENV: 'test' }))).toBe('127.0.0.1');
    expect(listenHost({ NODE_ENV: 'production', HOST: undefined })).toBe('127.0.0.1');
    expect(listenHost({ NODE_ENV: 'production', HOST: '0.0.0.0' })).toBe('0.0.0.0');
    expect(listenHost(parseEnv({ ...valid, HOST: ' 127.0.0.1 ' }))).toBe('127.0.0.1');
  });
});
