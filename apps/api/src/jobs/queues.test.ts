import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  events: [] as string[],
}));

vi.mock('bullmq', () => {
  class Queue {
    constructor(name: string) {
      state.events.push(`queue:${name}`);
    }

    async add() {}

    upsertJobScheduler(id: string) {
      state.events.push(`schedule:${id}`);
      return Promise.resolve();
    }

    async close() {}
  }

  class Worker {
    constructor(name: string) {
      state.events.push(`worker:${name}`);
    }

    on() {}

    async close() {}
  }

  return { Queue, Worker };
});

vi.mock('../lib/logger', () => ({
  componentLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

vi.mock('../lib/redis', () => ({ getRedis: () => ({}) }));

vi.mock('./registry', () => ({
  JOB_TIMEZONE: 'Africa/Douala',
  getJobDefinition: (name: string) =>
    name === 'maintenance.scan' ? { name, process: () => Promise.resolve(undefined) } : undefined,
  jobDefinitions: () => [{ name: 'maintenance.scan', process: () => Promise.resolve(undefined) }],
  repeatableJobs: () => [
    { id: 'maintenance.scan.hourly', name: 'maintenance.scan', pattern: '0 * * * *' },
  ],
}));

import { startJobs, stopJobs } from './queues';

describe('job queues', () => {
  afterEach(async () => {
    await stopJobs();
    state.events.length = 0;
  });

  it('does not start long-running workers in the serverless queue', async () => {
    await startJobs();
    expect(state.events).toEqual([]);
  });
});
