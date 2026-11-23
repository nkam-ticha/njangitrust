// The developer console's HTTP helper (D28). It reuses the API address, the client header and the
// error type of the member client, but never its token, its refresh or its connectivity store: the
// developer token comes only from the developer store, is sent only to /v1/developer, and is never
// renewed. A 401 ends the developer session.
import { ApiError, NETWORK_UNAVAILABLE } from '@/api/client';
import { API_URL, CLIENT_HEADER } from '@/api/config';
import { queryClient } from '@/api/queryClient';
import { useDeveloperSession } from '@/state/developerSession';

type Method = 'GET' | 'POST' | 'DELETE';

async function toError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as {
      code?: string;
      messageFr?: string;
      messageEn?: string;
      details?: unknown;
    };
    const details =
      body.details && typeof body.details === 'object' && !Array.isArray(body.details)
        ? (body.details as Record<string, unknown>)
        : {};
    return new ApiError(
      response.status,
      body.code ?? `HTTP_${response.status}`,
      body.messageFr,
      body.messageEn,
      details,
    );
  } catch {
    return new ApiError(response.status, `HTTP_${response.status}`);
  }
}

/** Forgets the developer's token and every developer answer kept in memory. */
export function endDeveloperSession(ended = false): void {
  useDeveloperSession.getState().clear(ended);
  queryClient.removeQueries({ queryKey: ['developer'] });
}

export async function developerRequest<T>(
  method: Method,
  path: string,
  options: { body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const token = useDeveloperSession.getState().token;
  const headers: Record<string, string> = { Accept: 'application/json', ...CLIENT_HEADER };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.auth !== false && token) headers.Authorization = `Bearer ${token}`;
  let response: Response;
  try {
    response = await fetch(`${API_URL}/v1/developer${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      // No cookie ever travels with a developer call.
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, NETWORK_UNAVAILABLE);
  }
  if (!response.ok) {
    const error = await toError(response);
    if (response.status === 401 && options.auth !== false && token) endDeveloperSession(true);
    throw error;
  }
  return (await response.json()) as T;
}
