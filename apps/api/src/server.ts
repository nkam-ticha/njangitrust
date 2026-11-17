// Entry point: validates the environment, then starts HTTP, Socket.IO and the job workers.
import { createServer } from 'node:http';
import { createApp } from './app';
import { EnvError, getEnv, listenHost } from './config/env';
import { enqueueDueRepeatables, processCronRun, startJobs, stopJobs } from './jobs/queues';
import { logger } from './lib/logger';
import { disconnectPrisma } from './lib/prisma';
import { registerJobs } from './modules/register';
import { attachRealtimeServer, createRealtimeServer } from './realtime';

/** How often the long-running server looks at the job queue. On Vercel the cron function does it. */
const JOB_LOOP_MS = 5_000;

/** Runs due jobs and the schedules of this minute; one run at a time. */
function startJobLoop(): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    enqueueDueRepeatables()
      .then(() => processCronRun())
      .catch((error: unknown) => logger.error({ err: error }, 'job loop run failed'))
      .finally(() => {
        running = false;
      });
  }, JOB_LOOP_MS);
  return () => clearInterval(timer);
}

async function main(): Promise<void> {
  const env = getEnv();
  const app = createApp();
  const httpServer = createServer(app);
  const io = createRealtimeServer(httpServer, { origins: env.WEB_ORIGINS });

  registerJobs();
  await startJobs();
  const stopJobLoop = startJobLoop();

  const host = listenHost(env);
  httpServer.listen({ port: env.PORT, host }, () => {
    logger.info(
      {
        port: env.PORT,
        host: host ?? 'all interfaces',
        env: env.NODE_ENV,
        provider: env.PAYMENT_PROVIDER,
      },
      'NjangiTrust API listening',
    );
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    httpServer.close();
    await io.close();
    attachRealtimeServer(null);
    stopJobLoop();
    await stopJobs();
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
