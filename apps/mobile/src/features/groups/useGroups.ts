// Groups data (spec 2.7 Me, Groups; GRP-01, GRP-05). Responses validated with the shared contracts.
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import {
  groupCreatedSchema,
  groupOverviewSchema,
  membersResponseSchema,
  rulesResponseSchema,
  type CreateGroupRequest,
} from '@njangi/shared/contracts/groups';
import { myGroupsResponseSchema, type MyGroupDto } from '@njangi/shared/contracts/me';
import { pendingActionCreatedSchema } from '@njangi/shared/contracts/pending-actions';
import { api } from '@/api/client';
import { useSession } from '@/state/session';

export const groupKeys = {
  mine: ['me', 'groups'] as const,
  overview: (id: string) => ['group', id, 'overview'] as const,
  members: (id: string) => ['group', id, 'members'] as const,
  rules: (id: string) => ['group', id, 'rules'] as const,
  invites: (id: string) => ['group', id, 'invites'] as const,
};

export function useMyGroups() {
  const signedIn = useSession((s) => s.status === 'signedIn');
  return useQuery({
    queryKey: groupKeys.mine,
    enabled: signedIn,
    queryFn: async () =>
      (await api.get('/v1/me/groups', { schema: myGroupsResponseSchema })).groups,
  });
}

/** The group every tab shows. Chosen in the group switcher; defaults to the first live group. */
const useActiveGroupStore = create<{
  groupId: string | null;
  setGroupId: (id: string | null) => void;
}>((set) => ({
  groupId: null,
  setGroupId: (groupId) => set({ groupId }),
}));

const isLive = (g: MyGroupDto) => g.membershipStatus !== 'LEFT' && g.membershipStatus !== 'REMOVED';

export function useActiveGroup(): {
  group: MyGroupDto | null;
  groups: MyGroupDto[];
  setGroupId: (id: string) => void;
  loading: boolean;
  error: unknown;
} {
  const { data, isPending, error } = useMyGroups();
  const groupId = useActiveGroupStore((s) => s.groupId);
  const setGroupId = useActiveGroupStore((s) => s.setGroupId);
  const groups = data ?? [];
  const group =
    groups.find((g) => g.groupId === groupId) ?? groups.find(isLive) ?? groups[0] ?? null;
  useEffect(() => {
    if (group && group.groupId !== groupId) setGroupId(group.groupId);
  }, [group, groupId, setGroupId]);
  return { group, groups, setGroupId, loading: isPending, error };
}

export function useGroupOverview(groupId: string | null) {
  return useQuery({
    queryKey: groupKeys.overview(groupId ?? 'none'),
    enabled: !!groupId,
    queryFn: () => api.get(`/v1/groups/${groupId}/overview`, { schema: groupOverviewSchema }),
  });
}

export function useMembers(groupId: string | null) {
  return useQuery({
    queryKey: groupKeys.members(groupId ?? 'none'),
    enabled: !!groupId,
    queryFn: async () =>
      (await api.get(`/v1/groups/${groupId}/members`, { schema: membersResponseSchema })).members,
  });
}

export function useRules(groupId: string | null) {
  return useQuery({
    queryKey: groupKeys.rules(groupId ?? 'none'),
    enabled: !!groupId,
    queryFn: async () =>
      (await api.get(`/v1/groups/${groupId}/rules`, { schema: rulesResponseSchema })).ruleSet,
  });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  const setGroupId = useActiveGroupStore((s) => s.setGroupId);
  return useMutation({
    mutationFn: (body: CreateGroupRequest) =>
      api.post('/v1/groups', body, { schema: groupCreatedSchema }),
    onSuccess: async ({ group }) => {
      setGroupId(group.id);
      await qc.invalidateQueries({ queryKey: groupKeys.mine });
    },
  });
}

/** Starts the first cycle (R1.1, GRP-02): prepares a START_CYCLE card for the admin to confirm. */
export function useStartCycle(groupId: string | null) {
  return useMutation({
    mutationFn: async () =>
      (
        await api.post(
          `/v1/groups/${groupId}/cycles/start`,
          {},
          { schema: pendingActionCreatedSchema },
        )
      ).action,
  });
}
