// One log line per request: method, route pattern (never the raw URL, which can hold a link
// token), status and duration. Bodies are never logged.
import type { RequestHandler } from 'express';
import { clock } from '../lib/clock';
import { componentLogger } from '../lib/logger';

const log = componentLogger('http');

export function accessLog(): RequestHandler {
  return (req, res, next) => {
    const started = clock.nowMs();
    res.on('finish', () => {
      const route = req.route?.path ? `${req.baseUrl}${String(req.route.path)}` : '(unmatched)';
      const entry = {
        method: req.method,
        route,
        status: res.statusCode,
        durationMs: clock.nowMs() - started,
        client: req.clientKind,
      };
      if (res.statusCode >= 500) log.error(entry, 'request failed');
      else log.info(entry, 'request');
    });
    next();
  };
}
