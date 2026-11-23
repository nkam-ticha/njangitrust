// Work that must not hold a request's response (a model call that follows an action's result, an
// answer to an @njangi mention). On a long-running server it simply runs after the response. On
// Vercel the platform keeps the function alive for it through `waitUntil`, which the runtime
// exposes on the request context; where that is missing the caller has already queued the same work
// as a durable job (jobs/queues.ts), which the cron run picks up, so nothing is lost either way.
type WaitUntil = (promise: Promise<unknown>) => void;

interface RequestContext {
  get?: () => { waitUntil?: WaitUntil } | undefined;
}

function platformWaitUntil(): WaitUntil | null {
  try {
    const holder = (globalThis as Record<symbol, unknown>)[Symbol.for('@vercel/request-context')];
    const context = (holder as RequestContext | undefined)?.get?.();
    return context?.waitUntil ? (promise) => context.waitUntil!(promise) : null;
  } catch {
    return null;
  }
}

/** Starts `work` once the current turn of the event loop is done, without waiting for it. */
export function afterResponse(
  work: () => Promise<unknown>,
  onError: (error: unknown) => void,
): void {
  const task = new Promise<void>((resolve) => setImmediate(resolve))
    .then(work)
    .then(() => undefined)
    .catch(onError);
  platformWaitUntil()?.(task);
}
