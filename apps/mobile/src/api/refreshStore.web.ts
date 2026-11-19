// Web session storage: keeps the refresh token in localStorage so the session
// survives browser reloads. On platforms where cookies are also supported, both work together.

const STORAGE_KEY = 'njangi.refreshToken';

export const refreshStore = {
  holdsToken: true,
  get: (): Promise<string | null> => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return Promise.resolve(window.localStorage.getItem(STORAGE_KEY));
      }
    } catch {
      // localStorage unavailable or restricted
    }
    return Promise.resolve(null);
  },
  set: (token: string): Promise<void> => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, token);
      }
    } catch {
      // localStorage unavailable or restricted
    }
    return Promise.resolve();
  },
  clear: (): Promise<void> => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // localStorage unavailable or restricted
    }
    return Promise.resolve();
  },
};
