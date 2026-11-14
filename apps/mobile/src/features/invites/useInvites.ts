// Invitations (spec 2.10; ACC-03, GRP-02, R1.5, R1.6): the public preview, accepting (with sign-up
// or as an existing member), and the admin's list and creation of invite cards.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  acceptInviteResponseSchema,
  inviteListSchema,
  invitePreviewSchema,
  type AcceptInviteRequest,
  type CreateInviteRequest,
} from '@njangi/shared/contracts/invites';
import { pendingActionCreatedSchema } from '@njangi/shared/contracts/pending-actions';
import { api } from '@/api/client';
import { signIn } from '@/api/session';
import { useSession } from '@/state/session';
import { groupKeys } from '../groups/useGroups';

const previewResponseSchema = z.strictObject({ invite: invitePreviewSchema });

export function useInvitePreview(token: string) {
  return useQuery({
    queryKey: ['invite', token],
    retry: false,
    queryFn: async () =>
      (
        await api.get(`/v1/auth/invites/${encodeURIComponent(token)}`, {
          auth: false,
          schema: previewResponseSchema,
        })
      ).invite,
  });
}

export function useAcceptInvite(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AcceptInviteRequest) =>
      api.post(`/v1/auth/invites/${encodeURIComponent(token)}/accept`, body, {
        auth: body.mode === 'existing',
        schema: acceptInviteResponseSchema,
      }),
    onSuccess: async (response) => {
      if (response.user && response.session)
        await signIn({ user: response.user, session: response.session });
      else if (useSession.getState().status === 'signedIn')
        await qc.invalidateQueries({ queryKey: groupKeys.mine });
    },
  });
}

export function useGroupInvites(groupId: string | null, enabled = true) {
  return useQuery({
    queryKey: groupKeys.invites(groupId ?? 'none'),
    enabled: !!groupId && enabled,
    queryFn: async () =>
      (await api.get(`/v1/groups/${groupId}/invites`, { schema: inviteListSchema })).invites,
  });
}

/** Prepares an INVITE_CREATE card; confirming it returns the link once (inviteCreatedSchema). */
export function useCreateInvite(groupId: string | null) {
  return useMutation({
    mutationFn: async (body: CreateInviteRequest) =>
      (
        await api.post(`/v1/groups/${groupId}/invites`, body, {
          schema: pendingActionCreatedSchema,
        })
      ).action,
  });
}
