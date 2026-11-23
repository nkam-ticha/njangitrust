// Every environment variable the API reads, validated once at start-up (spec 2.16, D1, D2).
// Fails fast with the list of problems; never prints a value.
import { z } from 'zod';

const secret = (name: string) =>
  z.string().min(32, `${name} must be at least 32 characters (generate it, never type it)`);

/**
 * A model provider's address: https, and the provider's own host. Every request carries the API key
 * and the member's text, so a wrong address in the environment must not be able to receive them.
 */
function llmBaseUrl(host: string, fallback: string) {
  return z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname === host && !url.username && !url.password;
    }, `must be an https address on ${host}`)
    .default(fallback);
}

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === '' ? undefined : v.trim()));

/** `scheme://host[:port]` with at most a trailing slash: links are built by concatenation, so a
 *  path, query or credentials here could put a token somewhere it must not go. */
function isBareOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

const feeScheduleSchema = z.strictObject({
  collection: z.number().int().min(0),
  disbursement: z.number().int().min(0),
  /** Per-thousand part of the fee, on top of the fixed part (CamPay: 20 collection, 15 withdrawal). */
  collectionPermille: z.number().int().min(0).max(1000).default(0),
  disbursementPermille: z.number().int().min(0).max(1000).default(0),
});

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    /** Interface to listen on. Unset: every interface in development (phones on the LAN, D21),
     *  loopback otherwise (production sits behind a proxy; set HOST=0.0.0.0 in a container). */
    HOST: optionalString,
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
    /** Number of proxy hops in front of the API (for client IPs in rate limits). */
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),

    DATABASE_URL: z.string().url('DATABASE_URL must be a postgresql:// URL'),
    /** Optional during the Vercel transition; production serverless paths must not depend on it. */
    REDIS_URL: optionalString.pipe(z.string().url('REDIS_URL must be a redis:// URL').optional()),

    JWT_SECRET: secret('JWT_SECRET'),
    JWT_REFRESH_SECRET: secret('JWT_REFRESH_SECRET'),
    /**
     * D28: the developer console's own login. Both unset: the developer login is off. The hash is
     * an argon2id hash made with `tsx scripts/hash-developer-password.ts` (never the password).
     */
    DEVELOPER_USERNAME: optionalString.pipe(z.string().min(3).max(64).optional()),
    DEVELOPER_PASSWORD_HASH: optionalString.pipe(
      z
        .string()
        .startsWith('$argon2id$', 'DEVELOPER_PASSWORD_HASH must be an argon2id hash')
        .optional(),
    ),
    /** Signs developer tokens. Unset: a key derived from JWT_SECRET, never the same key. */
    DEVELOPER_JWT_SECRET: optionalString.pipe(secret('DEVELOPER_JWT_SECRET').optional()),
    CRON_SECRET: optionalString.pipe(z.string().min(32).optional()),
    /** Separate shared secret for trusted operator disbursement-refund callbacks. */
    DISBURSEMENT_REFUND_SECRET: optionalString.pipe(z.string().min(32).optional()),
    /** Key for hashing invited phone numbers. Falls back to a key derived from JWT_REFRESH_SECRET. */
    HASH_SECRET: optionalString.pipe(z.string().min(32).optional()),

    STORAGE_DRIVER: z.enum(['local', 's3', 'supabase']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('.storage'),
    STORAGE_SIGNING_SECRET: optionalString,
    S3_ENDPOINT: optionalString,
    S3_REGION: optionalString,
    S3_BUCKET: optionalString,
    S3_ACCESS_KEY: optionalString,
    S3_SECRET_KEY: optionalString,
    SUPABASE_URL: optionalString.pipe(z.string().url().optional()),
    SUPABASE_SERVICE_ROLE_KEY: optionalString,
    /** Project JWT signing secret used only to mint short-lived Realtime client tokens. */
    SUPABASE_JWT_SECRET: optionalString.pipe(z.string().min(32).optional()),
    SUPABASE_STORAGE_BUCKET: optionalString,

    PAYMENT_PROVIDER: z.enum(['mock', 'campay']).default('mock'),
    CAMPAY_USERNAME: optionalString,
    CAMPAY_PASSWORD: optionalString,
    /** The app's permanent access token (CamPay dashboard), used instead of username/password. */
    CAMPAY_ACCESS_TOKEN: optionalString,
    /** Checks the signature of CamPay's callbacks. */
    CAMPAY_WEBHOOK_KEY: optionalString,
    CAMPAY_ENV: z.enum(['DEV', 'PROD']).default('DEV'),
    FEE_SCHEDULE: z
      .string()
      .default('{"collection":100,"disbursement":500}')
      .transform((raw, ctx) => {
        try {
          return feeScheduleSchema.parse(JSON.parse(raw));
        } catch {
          ctx.addIssue({
            code: 'custom',
            message: 'FEE_SCHEDULE must be {"collection":int,"disbursement":int}',
          });
          return z.NEVER;
        }
      }),

    /** Expo push access token (optional; enhanced push security in the Expo project). */
    EXPO_ACCESS_TOKEN: optionalString,
    OPENROUTER_API_KEY: optionalString,
    OPENROUTER_MODEL: optionalString,
    OPENROUTER_BASE_URL: llmBaseUrl('openrouter.ai', 'https://openrouter.ai/api/v1'),
    /**
     * Second and third model providers: when one is rate-limited or down, the next answers. More
     * keys for the same provider and model go in the *_API_KEYS lists (docs/AGENT.md).
     */
    OPENROUTER_API_KEYS: optionalString,
    GROQ_API_KEYS: optionalString,
    GOOGLE_AI_API_KEYS: optionalString,
    GROQ_API_KEY: optionalString,
    GROQ_MODEL: optionalString,
    GROQ_BASE_URL: llmBaseUrl('api.groq.com', 'https://api.groq.com/openai/v1'),
    /** Groq's free tier takes about 7,000 input tokens a minute: a request is cut to this size. */
    GROQ_MAX_INPUT_TOKENS: z.coerce.number().int().min(500).max(200_000).default(6_000),
    GOOGLE_AI_API_KEY: optionalString,
    GOOGLE_AI_MODEL: optionalString,
    GOOGLE_AI_BASE_URL: llmBaseUrl(
      'generativelanguage.googleapis.com',
      'https://generativelanguage.googleapis.com/v1beta/openai',
    ),
    /** Optional input limits for the other two (unset: no cutting). */
    OPENROUTER_MAX_INPUT_TOKENS: z.coerce.number().int().min(500).max(2_000_000).optional(),
    GOOGLE_AI_MAX_INPUT_TOKENS: z.coerce.number().int().min(500).max(2_000_000).optional(),
    /** Who is asked first: names from `openrouter,groq,google`, comma separated. */
    LLM_PROVIDER_ORDER: z.string().default('openrouter,groq,google'),
    /** Spec 4.11: a short first call picks the tool categories. Off unless the model needs it. */
    AGENT_TOOL_ROUTING: z.enum(['on', 'off']).default('off'),
    /** Set by tools/agent-eval for its own process only; refused in production (below). */
    NJANGI_AGENT_EVAL: z.enum(['scripted', 'live']).optional(),

    APP_TIMEZONE: z.literal('Africa/Douala').default('Africa/Douala'),
    /** Public mobile/web application origin for links that must open an app route. Falls back to
     * PUBLIC_BASE_URL for existing deployments where the API and app share one origin. */
    PUBLIC_APP_URL: optionalString.pipe(
      z
        .string()
        .url('PUBLIC_APP_URL must be a full origin')
        .refine(
          isBareOrigin,
          'PUBLIC_APP_URL must be an origin only: no path, query or credentials',
        )
        .transform((v) => v.replace(/\/+$/, ''))
        .optional(),
    ),
    PUBLIC_BASE_URL: z.string().url(),
    /**
     * D1: SameSite of the web refresh cookie. `strict` when the web app and the API share a site;
     * `none` when they do not (for example two `*.vercel.app` projects, which are different sites):
     * the cookie is then also sent on cross-site requests, and the CSRF defence is the required
     * `X-Njangi-Client: web` header plus the `WEB_ORIGINS` allowlist (see session-delivery.ts).
     */
    COOKIE_SAMESITE: z.enum(['strict', 'none']).default('strict'),
    /** D1: comma-separated web origins allowed by CORS, e.g. `http://localhost:8081`. */
    WEB_ORIGINS: z
      .string()
      .default('')
      .transform((raw) =>
        raw
          .split(',')
          .map((o) => o.trim().replace(/\/$/, ''))
          .filter((o) => o.length > 0),
      )
      .pipe(
        z.array(z.string().url('WEB_ORIGINS must be full origins such as https://app.example.com')),
      ),
  })
  .superRefine((env, ctx) => {
    if (env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_REFRESH_SECRET'],
        message: 'must differ from JWT_SECRET',
      });
    }
    if (Boolean(env.DEVELOPER_USERNAME) !== Boolean(env.DEVELOPER_PASSWORD_HASH)) {
      ctx.addIssue({
        code: 'custom',
        path: ['DEVELOPER_PASSWORD_HASH'],
        message: 'DEVELOPER_USERNAME and DEVELOPER_PASSWORD_HASH must be set together',
      });
    }
    if (env.DEVELOPER_JWT_SECRET && env.DEVELOPER_JWT_SECRET === env.JWT_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['DEVELOPER_JWT_SECRET'],
        message: 'must differ from JWT_SECRET',
      });
    }
    if (env.STORAGE_DRIVER === 'local' && (env.STORAGE_SIGNING_SECRET ?? '').length < 32) {
      ctx.addIssue({
        code: 'custom',
        path: ['STORAGE_SIGNING_SECRET'],
        message: 'is required (at least 32 characters) with STORAGE_DRIVER=local',
      });
    }
    if (env.STORAGE_DRIVER === 's3') {
      for (const key of ['S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'] as const) {
        if (!env[key])
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'is required with STORAGE_DRIVER=s3',
          });
      }
    }
    if (env.STORAGE_DRIVER === 'supabase') {
      for (const key of [
        'SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY',
        'SUPABASE_STORAGE_BUCKET',
      ] as const) {
        if (!env[key])
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'is required with STORAGE_DRIVER=supabase',
          });
      }
    }
    if (env.NODE_ENV === 'production' && env.NJANGI_AGENT_EVAL) {
      ctx.addIssue({
        code: 'custom',
        path: ['NJANGI_AGENT_EVAL'],
        message: 'is not allowed in production',
      });
    }
    if (env.NODE_ENV === 'production' && !env.CRON_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['CRON_SECRET'],
        message: 'is required in production for Vercel Cron',
      });
    }
    if (env.PAYMENT_PROVIDER === 'campay') {
      if (!env.CAMPAY_ACCESS_TOKEN && !(env.CAMPAY_USERNAME && env.CAMPAY_PASSWORD)) {
        ctx.addIssue({
          code: 'custom',
          path: ['CAMPAY_ACCESS_TOKEN'],
          message:
            'PAYMENT_PROVIDER=campay needs CAMPAY_ACCESS_TOKEN, or CAMPAY_USERNAME and CAMPAY_PASSWORD',
        });
      }
    }
    if (env.NODE_ENV === 'production') {
      if (!env.PUBLIC_BASE_URL.startsWith('https://')) {
        ctx.addIssue({
          code: 'custom',
          path: ['PUBLIC_BASE_URL'],
          message: 'must use https in production',
        });
      }
      if (env.PUBLIC_APP_URL && !env.PUBLIC_APP_URL.startsWith('https://')) {
        ctx.addIssue({
          code: 'custom',
          path: ['PUBLIC_APP_URL'],
          message: 'must use https in production',
        });
      }
      // D1: browsers only send the Secure refresh cookie over https, and an http origin would
      // let a network attacker script the app. Development may allow http LAN origins.
      if (env.WEB_ORIGINS.some((origin) => !origin.startsWith('https://'))) {
        ctx.addIssue({
          code: 'custom',
          path: ['WEB_ORIGINS'],
          message: 'must all use https in production',
        });
      }
      if (!env.HASH_SECRET) {
        ctx.addIssue({
          code: 'custom',
          path: ['HASH_SECRET'],
          message: 'is required in production',
        });
      }
    }
  });

export type Env = z.infer<typeof schema>;

export class EnvError extends Error {
  override name = 'EnvError';
}

/** Validates an environment. Throws an EnvError listing every problem (names only, no values). */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (result.success) return Object.freeze(result.data);
  const lines = result.error.issues.map((issue) => {
    const key = issue.path.join('.') || '(environment)';
    return `  - ${key}: ${issue.message}`;
  });
  throw new EnvError(`Invalid environment (see apps/api/.env):\n${lines.join('\n')}`);
}

/** The interface the HTTP server binds: HOST, else all interfaces in development only. */
export function listenHost(env: Pick<Env, 'HOST' | 'NODE_ENV'>): string | undefined {
  if (env.HOST) return env.HOST;
  // undefined = Node's default: every IPv6 and IPv4 interface, so phones on the Wi-Fi reach it.
  return env.NODE_ENV === 'development' ? undefined : '127.0.0.1';
}

let cached: Env | undefined;

/** The validated environment of this process, read once. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Tests only: forget the cached environment after changing process.env. */
export function resetEnvCache(): void {
  cached = undefined;
}
