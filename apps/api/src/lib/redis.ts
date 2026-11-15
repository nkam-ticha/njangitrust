// Redis connections (D2: redis-server in WSL on localhost:6379). BullMQ needs its own connection
// with `maxRetriesPerRequest: null`; rate limits use a fail-fast connection so a Redis outage
// falls back to the in-memory insurance limiter instead of hanging requests.
import { Redis } from 'ioredis';
import { getEnv } from '../config/env';

export type RedisPurpose = 'limits' | 'jobs' | 'health';

export function createRedis(purpose: RedisPurpose): Redis {
  const url = getEnv().REDIS_URL;
  if (!url) throw new Error('REDIS_URL is required only for legacy Redis callers');
  const jobs = purpose === 'jobs';
  // Rate limits must fail fast (the in-memory insurance limiter takes over); other connections
  // queue commands until connected.
  const failFast = purpose === 'limits';
  return new Redis(url, {
    connectionName: `njangitrust-${purpose}`,
    maxRetriesPerRequest: jobs ? null : 1,
    enableOfflineQueue: !failFast,
    connectTimeout: 5_000,
  });
}

const connections = new Map<RedisPurpose, Redis>();

/** The shared connection for one purpose, created on first use. */
export function getRedis(purpose: RedisPurpose): Redis {
  let connection = connections.get(purpose);
  if (!connection) {
    connection = createRedis(purpose);
    connections.set(purpose, connection);
  }
  return connection;
}

export async function closeRedis(): Promise<void> {
  const all = [...connections.values()];
  connections.clear();
  await Promise.allSettled(all.map((c) => c.quit()));
}
