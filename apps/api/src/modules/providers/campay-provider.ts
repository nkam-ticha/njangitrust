// CamPay (spec 2.6) behind the PaymentProvider interface. Nothing here decides anything about
// money: it asks CamPay to collect or send, and reports what CamPay says. A payment or a send is
// only ever recorded after `getPaymentStatus` / `getDisbursementStatus` returns SUCCESSFUL.
// Our PaymentIntent or Disbursement id goes as `external_reference` (CamPay refuses a duplicate),
// so a repeated request can never collect or send twice.
import { clock } from '../../lib/clock';
import type { PaymentProvider, ProviderStatus } from './payment-provider';

export interface CampayConfig {
  /** `https://demo.campay.net` or `https://www.campay.net`. */
  baseUrl: string;
  /** The app's permanent access token, when the dashboard gives one. */
  accessToken?: string | undefined;
  /** App username and password, exchanged for a short-lived token at `/api/token/`. */
  username?: string | undefined;
  password?: string | undefined;
  timeoutMs?: number;
  fetch?: typeof fetch;
  nowMs?: () => number;
}

/** A refusal or failure of a CamPay call. Carries a code only: never a body, number or token. */
export class CampayError extends Error {
  readonly refused: boolean;

  constructor(
    readonly code: string,
    readonly httpStatus: number | null,
  ) {
    super(`CamPay ${code}`);
    // A 4xx answer (other than an authentication, timeout or rate-limit one) or a value we
    // refused to send: nothing was started. A timeout or a 5xx leaves the outcome unknown.
    this.refused =
      httpStatus === null
        ? code === 'INVALID_PHONE' || code === 'INVALID_AMOUNT'
        : httpStatus >= 400 && httpStatus < 500 && ![401, 408, 429].includes(httpStatus);
    this.name = 'CampayError';
  }
}

export const CAMPAY_BASE_URLS = {
  DEV: 'https://demo.campay.net',
  PROD: 'https://www.campay.net',
} as const;

const TOKEN_MARGIN_MS = 60_000;

/** `+2376XXXXXXXX` as CamPay wants it: country code, no plus sign. */
function campayPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!/^2376\d{8}$/.test(digits)) throw new CampayError('INVALID_PHONE', null);
  return digits;
}

function statusOf(value: unknown): ProviderStatus {
  if (value === 'SUCCESSFUL') return 'SUCCESSFUL';
  if (value === 'FAILED') return 'FAILED';
  return 'PENDING';
}

function operatorOf(value: unknown): 'MTN' | 'ORANGE' | undefined {
  const name = typeof value === 'string' ? value.toUpperCase() : '';
  return name.includes('MTN') ? 'MTN' : name.includes('ORANGE') ? 'ORANGE' : undefined;
}

/** CamPay writes amounts as numbers or strings, sometimes with decimals: whole francs, rounded down. */
function wholeFrancs(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/** CamPay's own error code (ER101, ER201, ER301...) when the body carries one. */
function errorCodeOf(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const code = (body as Record<string, unknown>).error_code;
    if (typeof code === 'string' && /^[A-Z0-9_]{2,20}$/.test(code)) return code;
  }
  return `HTTP_${status}`;
}

export class CampayProvider implements PaymentProvider {
  private readonly http: typeof fetch;
  private readonly nowMs: () => number;
  private readonly timeoutMs: number;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: CampayConfig) {
    const url = new URL(config.baseUrl);
    if (url.protocol !== 'https:') throw new Error('CamPay requires HTTPS');
    if (!config.accessToken && !(config.username && config.password)) {
      throw new Error('CamPay needs an access token or a username and password');
    }
    this.http = config.fetch ?? fetch;
    this.nowMs = config.nowMs ?? (() => clock.nowMs());
    this.timeoutMs = config.timeoutMs ?? 20_000;
  }

  private url(path: string): string {
    return `${this.config.baseUrl.replace(/\/+$/, '')}/api/${path}`;
  }

  private async send(path: string, init: RequestInit): Promise<{ status: number; body: unknown }> {
    let response: Response;
    try {
      response = await this.http(this.url(path), {
        ...init,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new CampayError('UNREACHABLE', null);
    }
    const body: unknown = await response.json().catch(() => null);
    return { status: response.status, body };
  }

  /** The token to send: the permanent one, or a short-lived one renewed before it expires. */
  private async authToken(renew: boolean): Promise<string> {
    const { accessToken, username, password } = this.config;
    if (accessToken && !renew) return accessToken;
    if (!username || !password) throw new CampayError('UNAUTHORIZED', 401);
    if (!renew && this.token && this.token.expiresAt - TOKEN_MARGIN_MS > this.nowMs()) {
      return this.token.value;
    }
    const { status, body } = await this.send('token/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = (body ?? {}) as Record<string, unknown>;
    if (status !== 200 || typeof data.token !== 'string') {
      throw new CampayError('UNAUTHORIZED', status);
    }
    const seconds = typeof data.expires_in === 'number' ? data.expires_in : 3_600;
    this.token = { value: data.token, expiresAt: this.nowMs() + seconds * 1_000 };
    return data.token;
  }

  /** An authenticated call. A 401 is retried once with a fresh token when one can be asked for. */
  private async call(
    method: 'GET' | 'POST',
    path: string,
    payload?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const canRenew = Boolean(this.config.username && this.config.password);
    for (const renew of [false, true]) {
      if (renew && !canRenew) break;
      const token = await this.authToken(renew);
      const { status, body } = await this.send(path, {
        method,
        headers: {
          authorization: `Token ${token}`,
          ...(payload ? { 'content-type': 'application/json' } : {}),
        },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      });
      if (status === 401 && !renew && canRenew) continue;
      if (status === 401) throw new CampayError('UNAUTHORIZED', 401);
      if (status < 200 || status >= 300) throw new CampayError(errorCodeOf(body, status), status);
      if (!body || typeof body !== 'object') throw new CampayError('BAD_RESPONSE', status);
      return body as Record<string, unknown>;
    }
    throw new CampayError('UNAUTHORIZED', 401);
  }

  private async start(
    path: 'collect/' | 'withdraw/',
    party: 'from' | 'to',
    input: { amount: number; phone: string; externalRef: string; description: string },
  ): Promise<{ providerRef: string; status: 'PENDING' }> {
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
      throw new CampayError('INVALID_AMOUNT', null);
    }
    const data = await this.call('POST', path, {
      amount: String(input.amount),
      currency: 'XAF',
      [party]: campayPhone(input.phone),
      description: input.description.slice(0, 100),
      external_reference: input.externalRef,
    });
    if (typeof data.reference !== 'string' || !data.reference) {
      throw new CampayError('BAD_RESPONSE', 200);
    }
    return { providerRef: data.reference, status: 'PENDING' };
  }

  private transaction(providerRef: string): Promise<Record<string, unknown>> {
    if (!/^[A-Za-z0-9-]{8,64}$/.test(providerRef)) throw new CampayError('INVALID_REFERENCE', null);
    return this.call('GET', `transaction/${providerRef}/`);
  }

  requestPayment(input: Parameters<PaymentProvider['requestPayment']>[0]) {
    return this.start('collect/', 'from', input);
  }

  async getPaymentStatus(providerRef: string) {
    const data = await this.transaction(providerRef);
    const status = statusOf(data.status);
    const operator = operatorOf(data.operator);
    const operatorRef =
      typeof data.operator_reference === 'string' && data.operator_reference
        ? data.operator_reference
        : undefined;
    return {
      status,
      ...(operator ? { operator } : {}),
      ...(operatorRef ? { operatorRef } : {}),
      // CamPay's status has no fee field: the settlement falls back to FEE_SCHEDULE (R4.4).
    };
  }

  disburse(input: Parameters<PaymentProvider['disburse']>[0]) {
    return this.start('withdraw/', 'to', input);
  }

  async getDisbursementStatus(providerRef: string) {
    const data = await this.transaction(providerRef);
    return { status: statusOf(data.status) };
  }

  async getBalance() {
    const data = await this.call('GET', 'balance/');
    const total = wholeFrancs(data.total_balance);
    if (total === null) throw new CampayError('BAD_RESPONSE', 200);
    const mtn = wholeFrancs(data.mtn_balance);
    const orange = wholeFrancs(data.orange_balance);
    return {
      total,
      ...(mtn !== null ? { mtn } : {}),
      ...(orange !== null ? { orange } : {}),
    };
  }
}
