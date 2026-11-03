import * as SecureStore from 'expo-secure-store';

// Phone: the refresh token lives in the OS keystore, never in plain storage (spec 2.10).
// Web uses refreshStore.web.ts, where the token is an httpOnly cookie JS can't read (D1).

const KEY = 'njangi.refreshToken';
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const refreshStore = {
  /** True when the client itself holds the refresh token and must send it. */
  holdsToken: true,
  get: () => SecureStore.getItemAsync(KEY, OPTIONS),
  set: (token: string) => SecureStore.setItemAsync(KEY, token, OPTIONS),
  clear: () => SecureStore.deleteItemAsync(KEY, OPTIONS),
};
