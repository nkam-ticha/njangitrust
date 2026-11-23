// Data hooks of the developer console (D28). Every key starts with 'developer' so one call removes
// everything when the session ends. Writes are never retried.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DeveloperGroupDetail,
  DeveloperGroupRow,
  DeveloperPage,
  DeveloperSession,
  DeveloperUserDetail,
  DeveloperUserRow,
} from '@njangi/shared/contracts/developer';
import { useDeveloperSession } from '@/state/developerSession';
import { developerRequest } from './developerApi';

export const PAGE_SIZE = 20;

// Full phone numbers are kept only as long as a screen needs them.
const memory = { gcTime: 60_000, staleTime: 0 } as const;

function search(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

/**
 * The login. The credentials are read when the request is made, never passed as mutation
 * variables: TanStack keeps variables in its mutation cache (5 minutes by default), and the
 * password must not stay anywhere in memory but the form until the attempt is sent.
 */
export function useDeveloperLogin(read: () => { username: string; password: string }) {
  const setSession = useDeveloperSession((s) => s.setSession);
  return useMutation({
    gcTime: 0,
    mutationFn: () =>
      developerRequest<{ session: DeveloperSession }>('POST', '/login', {
        body: read(),
        auth: false,
      }),
    onSuccess: ({ session }) => setSession(session.token, session.expiresAt),
  });
}

export type UserFilter = 'all' | 'active' | 'deleted';
export type GroupFilter = 'all' | 'FORMING' | 'ACTIVE' | 'CLOSED';

export function useDeveloperUsers(input: { q: string; status: UserFilter; page: number }) {
  const token = useDeveloperSession((s) => s.token);
  return useQuery({
    queryKey: ['developer', 'users', input],
    enabled: !!token,
    placeholderData: keepPreviousData,
    ...memory,
    queryFn: () =>
      developerRequest<DeveloperPage<DeveloperUserRow>>(
        'GET',
        `/users${search({ ...input, pageSize: PAGE_SIZE })}`,
      ),
  });
}

export function useDeveloperUser(id: string) {
  const token = useDeveloperSession((s) => s.token);
  return useQuery({
    queryKey: ['developer', 'user', id],
    enabled: !!token,
    ...memory,
    queryFn: async () =>
      (await developerRequest<{ user: DeveloperUserDetail }>('GET', `/users/${id}`)).user,
  });
}

export function useDeleteDeveloperUser(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await developerRequest<{ user: DeveloperUserDetail }>('DELETE', `/users/${id}`)).user,
    onSuccess: (user) => {
      client.setQueryData(['developer', 'user', id], user);
      void client.invalidateQueries({ queryKey: ['developer', 'users'] });
      void client.invalidateQueries({ queryKey: ['developer', 'groups'] });
      void client.invalidateQueries({ queryKey: ['developer', 'group'] });
    },
  });
}

export function useDeveloperGroups(input: { q: string; status: GroupFilter; page: number }) {
  const token = useDeveloperSession((s) => s.token);
  return useQuery({
    queryKey: ['developer', 'groups', input],
    enabled: !!token,
    placeholderData: keepPreviousData,
    ...memory,
    queryFn: () =>
      developerRequest<DeveloperPage<DeveloperGroupRow>>(
        'GET',
        `/groups${search({ ...input, pageSize: PAGE_SIZE })}`,
      ),
  });
}

export function useDeveloperGroup(id: string) {
  const token = useDeveloperSession((s) => s.token);
  return useQuery({
    queryKey: ['developer', 'group', id],
    enabled: !!token,
    ...memory,
    queryFn: async () =>
      (await developerRequest<{ group: DeveloperGroupDetail }>('GET', `/groups/${id}`)).group,
  });
}

export function useCloseDeveloperGroup(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (
        await developerRequest<{ group: DeveloperGroupDetail }>('POST', `/groups/${id}/close`, {
          body: {},
        })
      ).group,
    onSuccess: (group) => {
      client.setQueryData(['developer', 'group', id], group);
      void client.invalidateQueries({ queryKey: ['developer', 'groups'] });
      void client.invalidateQueries({ queryKey: ['developer', 'user'] });
    },
  });
}
