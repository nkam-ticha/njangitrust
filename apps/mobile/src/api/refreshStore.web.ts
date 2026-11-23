// Web: the refresh token is an httpOnly cookie that script cannot read (D1), so the client holds
// nothing and sends no token in the body; the browser attaches the cookie to /v1/auth/refresh.
// An older build kept a copy in localStorage: it is removed here and never written again.

const LEGACY_KEY = 'njangi.refreshToken';

function dropLegacyCopy(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(LEGACY_KEY);
    }
  } catch {
    // localStorage unavailable or restricted
  }
}

export const refreshStore = {
  holdsToken: false,
  get: (): Promise<string | null> => Promise.resolve(null),
  set: (_token: string): Promise<void> => {
    dropLegacyCopy();
    return Promise.resolve();
  },
  clear: (): Promise<void> => {
    dropLegacyCopy();
    return Promise.resolve();
  },
};
