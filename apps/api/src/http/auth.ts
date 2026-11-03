// Authentication middleware: a Bearer access token, verified (HS256, issuer, audience, expiry)
// and checked against the live session on every request.
import type { Request, RequestHandler } from 'express';
import { commonError } from '../lib/errors';
import { setContextUser } from '../lib/request-context';
import type { AuthActor } from '../permissions/actor';
import { verifyAccessSession } from '../modules/auth/sessions';

const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

async function resolveActor(req: Request): Promise<AuthActor | null> {
  const header = req.get('authorization');
  if (!header) return null;
  const match = BEARER.exec(header);
  if (!match?.[1]) throw commonError('UNAUTHENTICATED');
  const session = await verifyAccessSession(match[1]);
  if (!session) throw commonError('UNAUTHENTICATED');
  const { expiresAt: _expiresAt, ...actor } = session;
  return actor;
}

/** Requires a valid session. Verified once per request, however many routers ask. */
export function requireAuth(): RequestHandler {
  return async (req, _res, next) => {
    if (req.actor) return next();
    const actor = await resolveActor(req);
    if (!actor) throw commonError('UNAUTHENTICATED');
    req.actor = actor;
    setContextUser(actor.userId);
    next();
  };
}

/** Uses a session when one is presented; an invalid token is still refused. */
export function optionalAuth(): RequestHandler {
  return async (req, _res, next) => {
    const actor = await resolveActor(req);
    if (actor) {
      req.actor = actor;
      setContextUser(actor.userId);
    }
    next();
  };
}

/** The authenticated actor of a request behind `requireAuth`. */
export function actorOf(req: Request): AuthActor {
  if (!req.actor) throw commonError('UNAUTHENTICATED');
  return req.actor;
}
