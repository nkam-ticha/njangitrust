// Opens the screen a notification (or a push) points at: makes its group active, then navigates.
// A link the app does not know, or points at something gone, does nothing: never an error page.
import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useActiveGroup } from '@/features/groups/useGroups';
import { newRoute } from '@/screens/shared/routes';
import { hrefFor, resolveDeepLink } from './deepLinks';

export function useOpenLink(): (link: string | null | undefined) => boolean {
  const router = useRouter();
  const { setGroupId } = useActiveGroup();
  return useCallback(
    (link) => {
      const target = resolveDeepLink(link);
      if (!target) return false;
      if (target.groupId) setGroupId(target.groupId);
      router.push(newRoute(hrefFor(target)));
      return true;
    },
    [router, setGroupId],
  );
}
