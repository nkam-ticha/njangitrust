// CORS (D1): only the configured web origins, with credentials (the refresh cookie). A request
// that carries any other Origin is refused outright, so a foreign site can't even trigger a
// state change. Mobile apps send no Origin header and are unaffected.
import type { RequestHandler } from 'express';
import { CLIENT_HEADER } from '@njangi/shared/contracts/common';
import { commonError } from '../lib/errors';

const ALLOWED_HEADERS = ['Authorization', 'Content-Type', 'X-Request-Id', CLIENT_HEADER].join(', ');
const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE';

export function cors(allowedOrigins: readonly string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req, res, next) => {
    res.vary('Origin');
    const origin = req.get('origin');
    if (!origin) return next();
    if (!allowed.has(origin)) return next(commonError('ORIGIN_NOT_ALLOWED'));

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id, Retry-After');
    if (req.method === 'OPTIONS' && req.get('access-control-request-method')) {
      res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
      res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
      res.setHeader('Access-Control-Max-Age', '600');
      res.status(204).end();
      return;
    }
    next();
  };
}
