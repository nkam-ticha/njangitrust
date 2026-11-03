// Request id (spec 2.15): reuses a well-formed incoming X-Request-Id or creates one, returns it in
// the response, and runs the rest of the request inside a context so every log line carries it.
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { CLIENT_HEADER } from '@njangi/shared/contracts/common';
import { runWithContext } from '../lib/request-context';

const VALID_ID = /^[A-Za-z0-9-]{8,64}$/;

export function requestId(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.get('x-request-id');
    const requestId = incoming && VALID_ID.test(incoming) ? incoming : randomUUID();
    req.requestId = requestId;
    req.clientKind = req.get(CLIENT_HEADER) === 'web' ? 'web' : 'mobile';
    res.setHeader('X-Request-Id', requestId);
    runWithContext({ requestId }, () => next());
  };
}
