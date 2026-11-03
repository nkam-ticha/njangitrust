import { Platform } from 'react-native';

/**
 * API origin. On a phone this must be the computer's LAN address
 * (EXPO_PUBLIC_API_URL=http://192.168.x.x:3000); on web, localhost works.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/** Sent on every request. The API requires it for cookie-authenticated web calls (D1, CSRF). */
export const CLIENT_HEADER = { 'X-Njangi-Client': Platform.OS === 'web' ? 'web' : 'native' } as const;

export const IS_WEB = Platform.OS === 'web';
