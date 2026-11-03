// GET /health (spec 2.15): database, Redis, storage and payment provider, each up or down. No
// versions, hosts or error messages are ever shown. Modules add checks (the money engineer's
// providers module registers `provider`).
import { Router } from 'express';
import { componentLogger } from '../lib/logger';

export type CheckStatus = 'up' | 'down' | 'not_configured';
export type HealthCheck = () => Promise<boolean>;

const log = componentLogger('health');
const checks = new Map<string, HealthCheck>();
const CHECK_TIMEOUT_MS = 3_000;
const REQUIRED = ['database', 'redis', 'storage', 'provider'] as const;

export function registerHealthCheck(name: string, check: HealthCheck): void {
  checks.set(name, check);
}

async function run(name: string): Promise<CheckStatus> {
  const check = checks.get(name);
  if (!check) return 'not_configured';
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), CHECK_TIMEOUT_MS);
    });
    return (await Promise.race([check(), timeout])) ? 'up' : 'down';
  } catch (error) {
    log.warn({ check: name, err: error }, 'health check failed');
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

export function healthRoutes(): Router {
  const router = Router();
  router.get('/', async (_req, res) => {
    const names = [...new Set([...REQUIRED, ...checks.keys()])];
    const results = await Promise.all(names.map(async (name) => [name, await run(name)] as const));
    const status = Object.fromEntries(results);
    const healthy = results.every(([, s]) => s !== 'down');
    res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', checks: status });
  });
  return router;
}
