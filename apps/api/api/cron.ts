import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { registerJobs } from '../src/modules/register';
import { enqueueDueRepeatables, JOB_BATCH_LIMIT, processDueJobs } from '../src/jobs/queues';
import { getEnv } from '../src/config/env';

function authorized(request: IncomingMessage, secret: string): boolean {
  const header = request.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
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
    registerJobs();
    const repeatables = await enqueueDueRepeatables();
    const result = await processDueJobs(JOB_BATCH_LIMIT);
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ ...result, repeatables }));
  } catch {
    response.statusCode = 500;
    response.end();
  }
}
