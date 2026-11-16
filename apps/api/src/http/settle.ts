// Holds the end of a response until the work the request started without waiting for it has
// finished (lib/pending-work.ts): realtime broadcasts and queued follow-up jobs would otherwise be
// lost when a serverless function is frozen after its response. With nothing pending (always the
// case on a local Socket.IO server) the response ends at once, exactly as before.
import type { RequestHandler, Response } from 'express';
import { hasPendingWork, settlePendingWork } from '../lib/pending-work';

export function settleBeforeResponse(): RequestHandler {
  return (_req, res, next) => {
    const end = res.end.bind(res) as (...args: unknown[]) => Response;
    res.end = ((...args: unknown[]) => {
      if (!hasPendingWork()) return end(...args);
      void settlePendingWork().finally(() => end(...args));
      return res;
    }) as Response['end'];
    next();
  };
}
