import { create } from 'zustand';

// The developer console's session (D28). Its own store, apart from the member session: the token
// lives in memory only. It is never written to SecureStore, AsyncStorage, localStorage or
// sessionStorage, so closing the tab or the app ends it. It lasts 30 minutes and is not renewed.

interface DeveloperSessionState {
  token: string | null;
  /** When the token stops working (ms since epoch). */
  expiresAt: number | null;
  /** The API said the token is no longer valid: the screen tells the developer once. */
  ended: boolean;
  setSession: (token: string, expiresAt: string) => void;
  /** Leaving on purpose, or after the token expired (`ended`). */
  clear: (ended?: boolean) => void;
}

export const useDeveloperSession = create<DeveloperSessionState>((set) => ({
  token: null,
  expiresAt: null,
  ended: false,
  setSession: (token, expiresAt) => set({ token, expiresAt: Date.parse(expiresAt), ended: false }),
  clear: (ended = false) => set({ token: null, expiresAt: null, ended }),
}));
