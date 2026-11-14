// A tiny client for the NjangiTrust API, as a phone would call it (X-Njangi-Client: native, so
// sessions come back in the body). Waits and retries when the API's rate limits answer 429.
import { randomUUID } from 'node:crypto';

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly messageEn: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(`${status} ${code}: ${messageEn}`);
  }
}

export interface Client {
  get<T>(path: string, token?: string): Promise<T>;
  post<T>(path: string, body: unknown, token?: string): Promise<T>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createClient(baseUrl: string, log: (line: string) => void): Client {
  async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown, token?: string) {
    for (let attempt = 0; ; attempt++) {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'X-Request-Id': randomUUID(),
        'X-Njangi-Client': 'native',
      };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok) return json as T;
      const code = typeof json.code === 'string' ? json.code : `HTTP_${res.status}`;
      const details = (json.details ?? {}) as Record<string, unknown>;
      // Flood limits (spec 4.2): wait as long as the API asks, then try again.
      if (res.status === 429 && code === 'RATE_LIMITED' && attempt < 10) {
        const seconds = Number(details.retryAfterSeconds ?? res.headers.get('Retry-After') ?? 30);
        log(`  … the API asks to slow down; waiting ${seconds + 1} s`);
        await sleep((seconds + 1) * 1000);
        continue;
      }
      const message = typeof json.messageEn === 'string' ? json.messageEn : '';
      throw new ApiFailure(res.status, code, message, details);
    }
  }
  return {
    get: (path, token) => call('GET', path, undefined, token),
    post: (path, body, token) => call('POST', path, body, token),
  };
}
