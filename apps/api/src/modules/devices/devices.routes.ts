// POST /v1/me/devices: registers this device (and its Expo push token) for this login.
import { Router } from 'express';
import { registerDeviceRequestSchema } from '@njangi/shared/contracts/me';
import { actorOf, requireAuth } from '../../http/auth';
import { handle } from '../../http/validate';
import { toDevice } from '../../dto';
import { registerDevice } from './devices.service';

export function devicesRoutes(): Router {
  const router = Router();
  router.post(
    '/',
    requireAuth(),
    handle({ body: registerDeviceRequestSchema }, async ({ body }, req, res) => {
      const actor = actorOf(req);
      res
        .status(201)
        .json({ device: toDevice(await registerDevice(actor.userId, actor.sessionId, body)) });
    }),
  );
  return router;
}
