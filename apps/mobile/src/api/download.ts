// Downloads a file the API serves behind the bearer token (the ledger export, spec 2.14). The JSON
// client in client.ts parses every answer as JSON and cannot read a CSV or keep a file's exact text,
// so this small helper sends the same headers and token, refreshes the session once on a 401 (like
// the client), and answers with the text of the file. It does not change client.ts.
import { useConnectivity } from '@/state/connectivity';
import { ApiError, NETWORK_UNAVAILABLE, accessTokenStore, refreshAccessToken } from './client';
import { API_URL, CLIENT_HEADER, IS_WEB } from './config';

/** A UUID v4 for `X-Request-Id` (the API accepts no other format). */
function requestId(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r % 4) + 8).toString(16);
  });
}

async function fetchOnce(path: string, signal?: AbortSignal): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: '*/*',
    'X-Request-Id': requestId(),
    ...CLIENT_HEADER,
  };
  const token = accessTokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method: 'GET',
      headers,
      credentials: IS_WEB ? 'include' : 'omit',
      signal,
    });
    useConnectivity.getState().markOnline();
    return response;
  } catch (error) {
    if (signal?.aborted) throw error;
    useConnectivity.getState().markOffline();
    throw new ApiError(0, NETWORK_UNAVAILABLE);
  }
}

/** The API's error body is `{ code, messageFr, messageEn }`; anything else becomes `HTTP_<status>`. */
async function toError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as Partial<
      Record<'code' | 'messageFr' | 'messageEn', string>
    >;
    return new ApiError(
      response.status,
      body.code ?? `HTTP_${response.status}`,
      body.messageFr,
      body.messageEn,
    );
  } catch {
    return new ApiError(response.status, `HTTP_${response.status}`);
  }
}

/** The text of a file the API serves to the signed-in member. Throws an ApiError like the client. */
export async function downloadText(path: string, signal?: AbortSignal): Promise<string> {
  let response = await fetchOnce(path, signal);
  if (response.status === 401 && (await refreshAccessToken())) {
    response = await fetchOnce(path, signal);
  }
  if (!response.ok) throw await toError(response);
  return response.text();
}
