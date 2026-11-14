import { Platform } from 'react-native';
import { resolveApiUrl } from './api-url';

/**
 * API origin. On a phone this must be the computer's LAN address
 * (EXPO_PUBLIC_API_URL=http://192.168.x.x:3000, set by `pnpm demo`); a development browser
 * uses the page's own host with that port (see api-url.ts).
 */
// Read with the literal `process.env.EXPO_PUBLIC_*` form: Expo inlines it at build time.
const configuredUrl: unknown = process.env.EXPO_PUBLIC_API_URL;
export const API_URL = resolveApiUrl(configuredUrl, {
  dev: __DEV__,
  pageHost: Platform.OS === 'web' ? globalThis.location?.hostname : undefined,
});

/** Sent on every request. The API requires it for cookie-authenticated web calls (D1, CSRF). */
export const CLIENT_HEADER = {
  'X-Njangi-Client': Platform.OS === 'web' ? 'web' : 'native',
} as const;

export const IS_WEB = Platform.OS === 'web';
