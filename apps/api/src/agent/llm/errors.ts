// Stable error codes for model calls. Messages never carry the provider's response body (it could
// echo the request) nor any part of the request.

export type LlmErrorCode =
  | 'LLM_NOT_CONFIGURED'
  | 'LLM_TIMEOUT'
  | 'LLM_RATE_LIMITED'
  | 'LLM_UNAVAILABLE'
  | 'LLM_AUTH'
  | 'LLM_BAD_REQUEST'
  | 'LLM_BAD_RESPONSE'
  | 'LLM_ABORTED';

export class LlmError extends Error {
  override name = 'LlmError';

  constructor(
    readonly code: LlmErrorCode,
    /** 429 and 5xx (and timeouts before any output) may be retried; nothing else is. */
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(code);
  }
}

export function isLlmError(error: unknown): error is LlmError {
  return error instanceof LlmError;
}

/** Maps an HTTP status from the provider to a stable code. */
export function llmErrorForStatus(status: number): LlmError {
  if (status === 401 || status === 403) return new LlmError('LLM_AUTH', false, status);
  if (status === 408) return new LlmError('LLM_TIMEOUT', true, status);
  if (status === 429) return new LlmError('LLM_RATE_LIMITED', true, status);
  if (status >= 500) return new LlmError('LLM_UNAVAILABLE', true, status);
  return new LlmError('LLM_BAD_REQUEST', false, status);
}
