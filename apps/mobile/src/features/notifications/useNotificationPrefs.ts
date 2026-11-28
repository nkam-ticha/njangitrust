// The member's notification settings (spec 1.8, D7): categories, quiet hours, chat mute, media.
// GET and PUT /v1/me/notification-prefs. A change shows at once and is put back if the server refuses.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  notificationPrefsResponseSchema,
  type NotificationPrefsDto,
  type UpdateNotificationPrefs,
} from '@njangi/shared/contracts/notifications';
import { api } from '@/api/client';
import { useSession } from '@/state/session';

export const prefsKey = ['me', 'notification-prefs'] as const;

export function useNotificationPrefs() {
  const signedIn = useSession((s) => s.status === 'signedIn');
  return useQuery({
    queryKey: prefsKey,
    enabled: signedIn,
    queryFn: async () =>
      (await api.get('/v1/me/notification-prefs', { schema: notificationPrefsResponseSchema }))
        .prefs,
  });
}

export function useUpdateNotificationPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (change: UpdateNotificationPrefs) =>
      (
        await api.put('/v1/me/notification-prefs', change, {
          schema: notificationPrefsResponseSchema,
        })
      ).prefs,
    onMutate: async (change) => {
      await qc.cancelQueries({ queryKey: prefsKey });
      const before = qc.getQueryData<NotificationPrefsDto>(prefsKey);
      if (before) qc.setQueryData<NotificationPrefsDto>(prefsKey, { ...before, ...change });
      return { before };
    },
    onError: (_error, _change, context) => {
      if (context?.before) qc.setQueryData(prefsKey, context.before);
    },
    onSuccess: (prefs) => qc.setQueryData(prefsKey, prefs),
  });
}
