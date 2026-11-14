import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { testApp } from '../../test/helpers/app';
import { getStorage } from '../storage';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);

describe('HTTP foundations', () => {
  it('reports health per dependency without details', async () => {
    const res = await request(testApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      checks: {
        database: 'up',
        redis: 'not_configured',
        storage: 'up',
        provider: 'not_configured',
      },
    });
  });

  it('sets security headers, a request id and no caching', async () => {
    const res = await request(testApp())
      .get('/health')
      .set('X-Request-Id', '1b4e28ba-2fa1-4d3b-a3f5-ef19b5a7633b');
    expect(res.headers['x-request-id']).toBe('1b4e28ba-2fa1-4d3b-a3f5-ef19b5a7633b');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cache-control']).toBe('no-store');
    const generated = await request(testApp())
      .get('/health')
      .set('X-Request-Id', 'bad id with spaces');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('answers errors as { code, messageFr, messageEn }', async () => {
    const missing = await request(testApp()).get('/v1/nothing-here');
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({
      code: 'ROUTE_NOT_FOUND',
      messageFr: expect.any(String),
      messageEn: expect.any(String),
    });

    const broken = await request(testApp())
      .post('/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"phone":');
    expect(broken.status).toBe(400);
    expect(broken.body.code).toBe('INVALID_JSON');

    const huge = await request(testApp())
      .post('/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ phone: 'x'.repeat(70_000) }));
    expect(huge.status).toBe(413);
    expect(huge.body.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('local storage URLs (D2, spec 2.12)', () => {
  it('uploads once with the signed type and size, and serves the detected type', async () => {
    const key = `groups/test/${Date.now()}.jpg`;
    const upload = await getStorage().createUploadUrl({
      key,
      contentType: 'image/jpeg',
      maxBytes: 64,
    });
    const path = new URL(upload.url).pathname + new URL(upload.url).search;

    const wrongType = await request(testApp())
      .put(path)
      .set('Content-Type', 'text/html')
      .send('<script>');
    expect(wrongType.status).toBe(415);
    const tooBig = await request(testApp())
      .put(path)
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.alloc(100));
    expect(tooBig.status).toBe(413);
    const tampered = await request(testApp())
      .put(path.replace('max=64', 'max=6400'))
      .set('Content-Type', 'image/jpeg')
      .send(JPEG);
    expect(tampered.status).toBe(403);

    expect(
      (await request(testApp()).put(path).set('Content-Type', 'image/jpeg').send(JPEG)).status,
    ).toBe(204);
    expect(
      (await request(testApp()).put(path).set('Content-Type', 'image/jpeg').send(JPEG)).status,
    ).toBe(409);

    const download = await getStorage().createDownloadUrl({ key });
    const read = await request(testApp()).get(
      new URL(download.url).pathname + new URL(download.url).search,
    );
    expect(read.status).toBe(200);
    expect(read.headers['content-type']).toBe('image/jpeg');
    expect(read.headers['x-content-type-options']).toBe('nosniff');
    const unsigned = await request(testApp()).get(
      `/v1/storage/local/${key}?op=get&exp=9999999999&ct=&max=0&sig=x`,
    );
    expect(unsigned.status).toBe(403);
  });
});
