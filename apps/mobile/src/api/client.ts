import type { ZodType } from 'zod';
import { useConnectivity } from '@/state/connectivity';
import { API_URL, CLIENT_HEADER, IS_WEB } from './config';

/**
 * An API error as the server sends it: `{ code, messageFr, messageEn }` (spec 2.7).
 * Errors raised by the client itself (no network) carry only a code; screens map
 * codes to i18n keys.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly messageFr?: string,
    readonly messageEn?: string,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

export const NETWORK_UNAVAILABLE = 'NETWORK_UNAVAILABLE';

// The access token lives in memory only (15 minutes). The refresh token is in
// SecureStore on phones and an httpOnly cookie on web (see refreshStore).
let accessToken: string | null = null;
export const accessTokenStore = {
  get: () => accessToken,
  set: (token: string | null) => {
    accessToken = token;
  },
};

/** Obtains a new access token; returns false when the session is over. Set by the session module. */
type RefreshHandler = () => Promise<boolean>;
let refreshHandler: RefreshHandler | null = null;
let refreshing: Promise<boolean> | null = null;

export function setRefreshHandler(handler: RefreshHandler | null): void {
  refreshHandler = handler;
}

/** One refresh at a time, however many requests hit a 401 together. */
function refreshOnce(): Promise<boolean> {
  if (!refreshHandler) return Promise.resolve(false);
  refreshing ??= refreshHandler().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export interface RequestOptions<T> {
  body?: unknown;
  /** Validates the response; use the shared contract schema. */
  schema?: ZodType<T>;
  /** Send the access token (default true). */
  auth?: boolean;
  signal?: AbortSignal;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function send(method: Method, path: string, options: RequestOptions<unknown>): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json', ...CLIENT_HEADER };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      // Web needs cookies for the refresh token (D1); phones never use cookies.
      credentials: IS_WEB ? 'include' : 'omit',
      signal: options.signal,
    });
    useConnectivity.getState().markOnline();
    return response;
  } catch (error) {
    if (options.signal?.aborted) throw error;
    useConnectivity.getState().markOffline();
    throw new ApiError(0, NETWORK_UNAVAILABLE);
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as Partial<Record<'code' | 'messageFr' | 'messageEn', string>>;
    return new ApiError(response.status, body.code ?? `HTTP_${response.status}`, body.messageFr, body.messageEn);
  } catch {
    return new ApiError(response.status, `HTTP_${response.status}`);
  }
}

export async function request<T>(method: Method, path: string, options: RequestOptions<T> = {}): Promise<T> {
  let response = await send(method, path, options);
  if (response.status === 401 && options.auth !== false && (await refreshOnce())) {
    response = await send(method, path, options);
  }
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  const json: unknown = await response.json();
  return options.schema ? options.schema.parse(json) : (json as T);
}

export const api = {
  get: <T>(path: string, options?: RequestOptions<T>) => request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions<T>) =>
    request<T>('POST', path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions<T>) =>
    request<T>('PUT', path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions<T>) =>
    request<T>('PATCH', path, { ...options, body }),
  delete: <T>(path: string, options?: RequestOptions<T>) => request<T>('DELETE', path, options),
};
