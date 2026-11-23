// In-app notifications (spec 1.8, 2.13): the list, the unread count for the bell, marking read.
// Built against contracts/notifications; the routes are being mounted by the platform engineer
// (GET /v1/notifications, POST /v1/notifications/read). Until then the list shows its empty state.
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationListSchema } from '@njangi/shared/contracts/notifications';
import { api } from '@/api/client';
import { withSocket } from '@/api/socket';
import { useSession } from '@/state/session';

const KEY = ['notifications'] as const;

export function useNotifications() {
  const qc = useQueryClient();
  const signedIn = useSession((s) => s.status === 'signedIn');
  const query = useQuery({
    queryKey: KEY,
    enabled: signedIn,
    retry: false,
    // The poll is the fallback when the realtime link is down or not up yet.
    refetchInterval: 20_000,
    queryFn: () => api.get('/v1/notifications?limit=50', { schema: notificationListSchema }),
  });
  useEffect(
    () =>
      // Waits for the realtime link when it is not up yet, and listens again after a reconnection.
      withSocket((socket) => {
        const onCreated = () => void qc.invalidateQueries({ queryKey: KEY });
        socket.on('notification.created', onCreated);
        return () => {
          socket.off('notification.created', onCreated);
        };
      }),
    [qc],
  );
  return query;
}

/** The bell's count (0 while the route is not available). */
export function useUnreadCount(): number {
  return useNotifications().data?.unreadCount ?? 0;
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { ids: string[] } | { all: true }) =>
      api.post('/v1/notifications/read', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
