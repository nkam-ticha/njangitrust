import { onlineManager, QueryClient } from '@tanstack/react-query';
import { useConnectivity } from '@/state/connectivity';
import { ApiError, NETWORK_UNAVAILABLE } from './client';

// Queries pause while offline and resume when the connection returns; the last
// known data stays on screen under the offline banner (spec 1.7).
onlineManager.setEventListener((setOnline) =>
  useConnectivity.subscribe((state) => setOnline(state.online)),
);

function isTransient(error: unknown): boolean {
  return error instanceof ApiError && (error.code === NETWORK_UNAVAILABLE || error.status >= 500);
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'offlineFirst',
      staleTime: 30_000,
      gcTime: 24 * 60 * 60_000,
      retry: (failureCount, error) => isTransient(error) && failureCount < 2,
    },
    mutations: {
      // Never retry a write automatically: a repeated payment request could charge
      // the member twice (spec 2.6). Money actions go through PendingActions anyway.
      networkMode: 'always',
      retry: false,
    },
  },
});
