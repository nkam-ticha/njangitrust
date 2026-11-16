import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { registerActionHandlers, registerJobs } from './modules/register';
import { useJobScheduler } from './jobs/dispatch';
import { enqueueDueRepeatables, processCronRun, scheduleAt } from './jobs/queues';
import { attachSupabaseRealtimePublisher } from './realtime/emitter';
import { getEnv } from './config/env';
import { settlePendingWork } from './lib/pending-work';

function authorized(request: IncomingMessage, secret: string): boolean {
  const header = request.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== 'GET' && request.method !== 'POST') {
    response.statusCode = 405;
    response.setHeader('Allow', 'GET, POST');
    response.end();
    return;
  }
  const secret = getEnv().CRON_SECRET;
  if (!secret || !authorized(request, secret)) {
    response.statusCode = 401;
    response.end();
    return;
  }
  try {
    const env = getEnv();
    // Same wiring as createApp(): a job that plans other jobs (statements.monthly, pushes) stores
    // them in the queue instead of running them detached, and job events reach Supabase Realtime.
    useJobScheduler(scheduleAt);
    attachSupabaseRealtimePublisher(
      env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
        ? { url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }
        : null,
    );
    registerActionHandlers();
    registerJobs();
    const repeatables = await enqueueDueRepeatables();
    const result = await processCronRun();
    // Events and follow-up jobs started by the jobs: finished before the function is frozen.
    await settlePendingWork();
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ ...result, repeatables }));
  } catch {
    response.statusCode = 500;
    response.end();
  }
}
