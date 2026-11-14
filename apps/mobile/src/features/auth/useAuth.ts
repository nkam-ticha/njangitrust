// Sign-up, login and PIN reset (spec 2.10; ACC-01, ACC-02, ACC-04). Successful calls hand the
// session to the lead's session module, which switches the app to (app).
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  authResponseSchema,
  CURRENT_CONSENT_VERSION,
  pinResetLinkPreviewSchema,
  pinResetRequestedSchema,
  type LoginRequest,
  type SignupRequest,
} from '@njangi/shared/contracts/auth';
import { api } from '@/api/client';
import { signIn } from '@/api/session';

export { CURRENT_CONSENT_VERSION };

export function useSignup() {
  return useMutation({
    mutationFn: (body: SignupRequest) =>
      api.post('/v1/auth/signup', body, { auth: false, schema: authResponseSchema }),
    onSuccess: (response) => signIn(response),
  });
}

export function useLogin() {
  return useMutation({
    mutationFn: (body: LoginRequest) =>
      api.post('/v1/auth/login', body, { auth: false, schema: authResponseSchema }),
    onSuccess: (response) => signIn(response),
  });
}

export function usePinResetRequest() {
  return useMutation({
    mutationFn: (phone: string) =>
      api.post(
        '/v1/auth/pin/reset-request',
        { phone },
        { auth: false, schema: pinResetRequestedSchema },
      ),
  });
}

/** The one-time link (30 minutes): whose PIN it resets. */
export function usePinResetLink(token: string) {
  return useQuery({
    queryKey: ['pinReset', token],
    retry: false,
    queryFn: () =>
      api.get(`/v1/auth/pin/reset/${encodeURIComponent(token)}`, {
        auth: false,
        schema: pinResetLinkPreviewSchema,
      }),
  });
}

export function usePinResetComplete(token: string) {
  return useMutation({
    mutationFn: (body: { phone: string; newPin: string }) =>
      api.post(`/v1/auth/pin/reset/${encodeURIComponent(token)}`, body, {
        auth: false,
        schema: authResponseSchema,
      }),
    onSuccess: (response) => signIn(response),
  });
}
