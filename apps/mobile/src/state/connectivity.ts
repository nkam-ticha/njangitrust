import { create } from 'zustand';

// Drives the offline banner ("Hors ligne, mis à jour à 14:32") and disables money
// actions and votes while offline (spec 1.7). Fed by API calls and the socket.

interface ConnectivityState {
  online: boolean;
  /** UTC ISO time of the last successful contact with the server. */
  lastSyncAt: string | null;
  markOnline: () => void;
  markOffline: () => void;
}

export const useConnectivity = create<ConnectivityState>((set, get) => ({
  online: true,
  lastSyncAt: null,
  markOnline: () => set({ online: true, lastSyncAt: new Date().toISOString() }),
  markOffline: () => {
    if (get().online) set({ online: false });
  },
}));
