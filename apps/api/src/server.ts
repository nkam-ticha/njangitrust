// Entry point: validates the environment, then starts HTTP, Socket.IO and the job workers.
import { createServer } from 'node:http';
import { createApp } from './app';
import { EnvError, getEnv } from './config/env';
import { registerHealthCheck } from './http/health';
import { useRedisForRateLimits } from './http/rate-limit';
import { startJobs, stopJobs } from './jobs/queues';
import { logger } from './lib/logger';
import { disconnectPrisma } from './lib/prisma';
import { closeRedis, getRedis } from './lib/redis';
import { registerJobs } from './modules/register';
import { attachRealtimeServer, createRealtimeServer } from './realtime';

async function main(): Promise<void> {
  const env = getEnv();
  useRedisForRateLimits(getRedis('limits'));
  registerHealthCheck('redis', async () => (await getRedis('health').ping()) === 'PONG');

  const app = createApp();
  const httpServer = createServer(app);
  const io = createRealtimeServer(httpServer, { origins: env.WEB_ORIGINS });

  registerJobs();
  await startJobs();

  httpServer.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV, provider: env.PAYMENT_PROVIDER }, 'NjangiTrust API listening');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    httpServer.close();
    await io.close();
    attachRealtimeServer(null);
    await stopJobs();
    await closeRedis();
    await disconnectPrisma();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  if (error instanceof EnvError) {
    // Names of the bad variables only; values are never printed.
    process.stderr.write(`${error.message}\n`);
  } else {
    logger.fatal({ err: error }, 'API failed to start');
  }
  process.exit(1);
});
