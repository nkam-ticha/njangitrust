import { create } from 'zustand';
import type { SelfDto } from '@njangi/shared/contracts/me';

// Who is signed in. The root layout shows (auth) or (app) from `status`.

type SessionStatus = 'restoring' | 'signedOut' | 'signedIn';

interface SessionState {
  status: SessionStatus;
  user: SelfDto | null;
  setSignedIn: (user: SelfDto) => void;
  setUser: (user: SelfDto) => void;
  setSignedOut: () => void;
}

export const useSession = create<SessionState>((set) => ({
  status: 'restoring',
  user: null,
  setSignedIn: (user) => set({ status: 'signedIn', user }),
  setUser: (user) => set({ user }),
  setSignedOut: () => set({ status: 'signedOut', user: null }),
}));
