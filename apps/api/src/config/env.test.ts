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
    expect(env.FEE_SCHEDULE).toEqual({
      collection: 100,
      disbursement: 500,
      collectionPermille: 0,
      disbursementPermille: 0,
    });
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

  it('accepts a separate, sufficiently long operator refund secret', () => {
    expect(
      parseEnv({ ...valid, DISBURSEMENT_REFUND_SECRET: 'r'.repeat(32) }).DISBURSEMENT_REFUND_SECRET,
    ).toBe('r'.repeat(32));
    expect(() => parseEnv({ ...valid, DISBURSEMENT_REFUND_SECRET: 'short' })).toThrow(EnvError);
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

describe('FEE_SCHEDULE with a per-thousand part', () => {
  it('keeps fixed-only schedules working and accepts percentages', () => {
    expect(parseEnv({ ...valid }).FEE_SCHEDULE).toMatchObject({
      collectionPermille: 0,
      disbursementPermille: 0,
    });
    const campay = parseEnv({
      ...valid,
      FEE_SCHEDULE:
        '{"collection":0,"disbursement":0,"collectionPermille":20,"disbursementPermille":15}',
    }).FEE_SCHEDULE;
    expect(campay).toEqual({
      collection: 0,
      disbursement: 0,
      collectionPermille: 20,
      disbursementPermille: 15,
    });
    expect(() =>
      parseEnv({
        ...valid,
        FEE_SCHEDULE: '{"collection":0,"disbursement":0,"collectionPermille":2.5}',
      }),
    ).toThrow();
  });
});

describe('model providers in the environment (docs/AGENT.md, D24)', () => {
  it('has the providers’ own https addresses by default and accepts several keys', () => {
    const env = parseEnv({
      ...valid,
      GROQ_API_KEY: 'g1',
      GROQ_API_KEYS: 'g2, g3',
      GROQ_MODEL: 'qwen/qwen3.8-27b',
    });
    expect(env.OPENROUTER_BASE_URL).toBe('https://openrouter.ai/api/v1');
    expect(env.GROQ_BASE_URL).toBe('https://api.groq.com/openai/v1');
    expect(env.GOOGLE_AI_BASE_URL).toBe('https://generativelanguage.googleapis.com/v1beta/openai');
    expect(env.GROQ_API_KEYS).toBe('g2, g3');
    expect(env.GROQ_MAX_INPUT_TOKENS).toBe(3_500);
    expect(env.LLM_PROVIDER_ORDER).toBe('openrouter,groq,google');
  });

  it.each([
    ['GROQ_BASE_URL', 'http://api.groq.com/openai/v1'],
    ['GROQ_BASE_URL', 'https://evil.example.com/openai/v1'],
    ['OPENROUTER_BASE_URL', 'https://user:pw@openrouter.ai/api/v1'],
    ['GOOGLE_AI_BASE_URL', 'https://generativelanguage.googleapis.com.evil.com/v1beta/openai'],
  ])('refuses %s=%s: the key and the member’s text would go there', (name, value) => {
    expect(() => parseEnv({ ...valid, [name]: value })).toThrow(EnvError);
  });
});
