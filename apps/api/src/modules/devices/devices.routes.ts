// POST /v1/me/devices: registers this device (and its Expo push token) for the member.
import { Router } from 'express';
import { registerDeviceRequestSchema, type DeviceDto } from '@njangi/shared/contracts/me';
import { actorOf, requireAuth } from '../../http/auth';
import { handle } from '../../http/validate';
import { iso } from '../../dto';
import { registerDevice, type DeviceSource } from './devices.service';

/** Allowlist: the push token itself never goes back to the client. */
function toDevice(device: DeviceSource): DeviceDto {
  return {
    id: device.id,
    platform: device.platform,
    pushEnabled: device.expoPushToken !== null,
    lastSeenAt: iso(device.lastSeenAt),
  };
}

export function devicesRoutes(): Router {
  const router = Router();
  router.post(
    '/',
    requireAuth(),
    handle({ body: registerDeviceRequestSchema }, async ({ body }, req, res) => {
      res.status(201).json({ device: toDevice(await registerDevice(actorOf(req).userId, body)) });
    }),
  );
  return router;
}
