// /v1/auth (spec 2.7, 2.10, D1). Validate, call the service, deliver the session for the client.
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  loginRequestSchema,
  logoutRequestSchema,
  pinChangeRequestSchema,
  pinResetCompleteRequestSchema,
  pinResetRequestSchema,
  refreshRequestSchema,
  signupRequestSchema,
} from '@njangi/shared/contracts/auth';
import { actorOf, optionalAuth, requireAuth } from '../../http/auth';
import { floodLimits, rateLimit } from '../../http/rate-limit';
import { clearRefreshCookie, deliverSession, refreshTokenOf } from '../../http/session-delivery';
import { handle } from '../../http/validate';
import { iso, toSelf } from '../../dto';
import { getSelfSource } from '../me';
import { authError } from './auth.errors';
import { changePin, login, logout, logoutEverywhere, refresh, signup, type AuthResult } from './auth.service';
import { completePinReset, previewPinResetLink, requestPinReset } from './pin-reset.service';

const tokenParams = z.strictObject({ token: z.string().regex(/^[A-Za-z0-9_-]{40,64}$/) });

function sendAuth(req: Request, res: Response, status: number, result: AuthResult): void {
  res.status(status).json({ user: toSelf(result.self), session: deliverSession(req, res, result.session) });
}

export function authRoutes(): Router {
  const router = Router();
  const authLimit = rateLimit(floodLimits.auth);

  router.post(
    '/signup',
    authLimit,
    handle({ body: signupRequestSchema }, async ({ body }, req, res) => {
      sendAuth(req, res, 201, await signup(body, req.clientKind));
    }),
  );

  router.post(
    '/login',
    authLimit,
    handle({ body: loginRequestSchema }, async ({ body }, req, res) => {
      sendAuth(req, res, 200, await login(body, req.clientKind));
    }),
  );

  router.post(
    '/refresh',
    rateLimit(floodLimits.refresh),
    handle({ body: refreshRequestSchema }, async ({ body }, req, res) => {
      const token = refreshTokenOf(req, body.refreshToken);
      if (!token) throw authError('SESSION_INVALID');
      try {
        res.json({ session: deliverSession(req, res, await refresh(token)) });
      } catch (error) {
        if (req.clientKind === 'web') clearRefreshCookie(res);
        throw error;
      }
    }),
  );

  router.post(
    '/logout',
    optionalAuth(),
    handle({ body: logoutRequestSchema }, async ({ body }, req, res) => {
      const token = refreshTokenOf(req, body.refreshToken);
      await logout({ ...(token ? { refreshToken: token } : {}), ...(req.actor ? { actor: req.actor } : {}) });
      clearRefreshCookie(res);
      res.status(204).end();
    }),
  );

  router.post(
    '/logout-all',
    requireAuth(),
    handle({}, async (_input, req, res) => {
      await logoutEverywhere(actorOf(req));
      clearRefreshCookie(res);
      res.status(204).end();
    }),
  );

  router.post(
    '/pin/change',
    requireAuth(),
    handle({ body: pinChangeRequestSchema }, async ({ body }, req, res) => {
      const session = await changePin(actorOf(req), body);
      res.json({ session: deliverSession(req, res, session) });
    }),
  );

  router.post(
    '/pin/reset-request',
    authLimit,
    handle({ body: pinResetRequestSchema }, async ({ body }, _req, res) => {
      await requestPinReset(body.phone);
      // Same answer whether or not the phone has an account.
      res.status(202).json({ status: 'REQUESTED' });
    }),
  );

  router.get(
    '/pin/reset/:token',
    authLimit,
    handle({ params: tokenParams }, async ({ params }, _req, res) => {
      const preview = await previewPinResetLink(params.token);
      res.json({ name: preview.name, expiresAt: iso(preview.expiresAt) });
    }),
  );

  router.post(
    '/pin/reset/:token',
    authLimit,
    handle({ params: tokenParams, body: pinResetCompleteRequestSchema }, async ({ params, body }, req, res) => {
      const { userId, session } = await completePinReset(params.token, body, req.clientKind);
      sendAuth(req, res, 200, { self: await getSelfSource(userId), session });
    }),
  );

  return router;
}
