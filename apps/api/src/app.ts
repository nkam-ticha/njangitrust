// The Express app factory (Express 5). Tests import this; src/server.ts adds the HTTP server,
// Socket.IO, Redis-backed rate limits and the job workers.
import express, { type Express } from 'express';
import { getEnv } from './config/env';
import { accessLog } from './http/access-log';
import { cookieParser } from './http/cookies';
import { cors } from './http/cors';
import { errorHandler, notFound } from './http/error-handler';
import { healthRoutes, registerHealthCheck } from './http/health';
import { floodLimits, rateLimit } from './http/rate-limit';
import { requestId } from './http/request-id';
import { v1Router } from './http/router';
import { securityHeaders } from './http/security-headers';
import { getPrisma } from './lib/prisma';
import { registerActionHandlers, registerJobs } from './modules/register';
import { getStorage, LocalStorage, LOCAL_STORAGE_ROUTE } from './storage';
import { localStorageRoutes } from './storage/local.routes';
import { attachSupabaseRealtimePublisher } from './realtime/emitter';
import { scheduleAt } from './jobs/queues';
import { useJobScheduler } from './jobs/dispatch';

/** JSON bodies are small: the largest request is a chat message or a proposal reason. */
const JSON_LIMIT = '64kb';

export function createApp(): Express {
  const env = getEnv();
  attachSupabaseRealtimePublisher(
    env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
      ? { url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }
      : null,
  );
  registerActionHandlers();
  registerJobs();
  useJobScheduler(scheduleAt);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  app.set('query parser', 'simple');

  app.use(requestId());
  app.use(accessLog());
  app.use(securityHeaders({ production: env.NODE_ENV === 'production' }));
  app.use(cors(env.WEB_ORIGINS));
  app.use(rateLimit(floodLimits.global));
  app.use(cookieParser());

  const storage = getStorage();
  registerHealthCheck(
    'database',
    async () => (await getPrisma().$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`).length === 1,
  );
  registerHealthCheck('storage', () => storage.check());
  app.use('/health', healthRoutes());

  if (storage instanceof LocalStorage) app.use(LOCAL_STORAGE_ROUTE, localStorageRoutes(storage));

  app.use(express.json({ limit: JSON_LIMIT, strict: true, type: 'application/json' }));
  app.use('/v1', v1Router());

  app.use(notFound());
  app.use(errorHandler());
  return app;
}
