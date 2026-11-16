// Work a request starts but does not wait for (a realtime broadcast, queuing a follow-up job). On a
// serverless host the process may be frozen as soon as the response is sent, so such work is
// tracked here and settled before the response ends (http/settle.ts) and before the cron function
// answers. In-flight promises only: nothing here outlives the request that started it.
const pending = new Set<Promise<unknown>>();

/** Tracks `work`; its failure is the caller's to log, it never rejects here. */
export function trackPendingWork(work: Promise<unknown>): void {
  const tracked = work.catch(() => undefined).finally(() => pending.delete(tracked));
  pending.add(tracked);
}

export function hasPendingWork(): boolean {
  return pending.size > 0;
}

/** Resolves when everything tracked so far (and what it started meanwhile) has finished. */
export async function settlePendingWork(): Promise<void> {
  while (pending.size > 0) await Promise.all([...pending]);
}
