// The member's own account (spec 2.7 Me; ACC-05: language switchable at any time).
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import type { Lang } from '@njangi/shared';
import { selfSchema } from '@njangi/shared/contracts/me';
import { api } from '@/api/client';
import { setLanguage } from '@/i18n';
import { useSession } from '@/state/session';

const meResponseSchema = z.strictObject({ user: selfSchema });

/** Applies the language at once, then saves it so Njangi and notifications follow (S-37). */
export function useChangeLanguage() {
  return useMutation({
    mutationFn: async (language: Lang) => {
      await setLanguage(language);
      return (await api.patch('/v1/me', { language }, { schema: meResponseSchema })).user;
    },
    onSuccess: (user) => useSession.getState().setUser(user),
  });
}
