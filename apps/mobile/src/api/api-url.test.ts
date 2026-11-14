import { describe, expect, it } from 'vitest';
import { resolveApiUrl } from './api-url';

const lan = 'http://192.168.1.20:3000';

describe('resolveApiUrl (D1, D21)', () => {
  it('uses the configured URL on a phone, without a trailing slash', () => {
    expect(resolveApiUrl(`${lan}/`, { dev: true })).toBe(lan);
    expect(resolveApiUrl(undefined, { dev: true })).toBe('http://localhost:3000');
    expect(resolveApiUrl('', { dev: true })).toBe('http://localhost:3000');
  });

  it('follows the page host in a development browser, keeping the API port', () => {
    expect(resolveApiUrl(lan, { dev: true, pageHost: 'localhost' })).toBe('http://localhost:3000');
    expect(resolveApiUrl(lan, { dev: true, pageHost: '192.168.1.20' })).toBe(lan);
    expect(resolveApiUrl('http://localhost:3100', { dev: true, pageHost: '10.0.0.7' })).toBe(
      'http://10.0.0.7:3100',
    );
  });

  it('never rewrites a production build or a public API host', () => {
    expect(resolveApiUrl(lan, { dev: false, pageHost: 'localhost' })).toBe(lan);
    expect(resolveApiUrl('https://api.example.com', { dev: true, pageHost: 'localhost' })).toBe(
      'https://api.example.com',
    );
    expect(resolveApiUrl(lan, { dev: true, pageHost: 'evil.example.com' })).toBe(lan);
  });
});
