// Devices for push notifications (spec 2.7 POST /me/devices, 2.13). A push token belongs to one
// device of one login: registering it again moves it, and revoking the login revokes the token
// (privacy-guard L9), so a logged-out phone stops receiving pushes.
import type { RegisterDeviceRequest } from '@njangi/shared/contracts/me';
import type { DeviceSource } from '../../dto/devices';
import { clock } from '../../lib/clock';
import { getPrisma, type Db } from '../../lib/prisma';

const select = { id: true, platform: true, expoPushToken: true, lastSeenAt: true } as const;

export async function registerDevice(
  userId: string,
  sessionFamilyId: string,
  input: RegisterDeviceRequest,
): Promise<DeviceSource> {
  const prisma = getPrisma();
  const now = clock.now();
  const data = {
    userId,
    platform: input.platform,
    lastSeenAt: now,
    sessionFamilyId,
    revokedAt: null,
  };
  if (input.expoPushToken) {
    return prisma.device.upsert({
      where: { expoPushToken: input.expoPushToken },
      create: { ...data, expoPushToken: input.expoPushToken },
      update: data,
      select,
    });
  }
  return prisma.device.create({ data, select });
}

const revoked = () => ({ revokedAt: clock.now(), expoPushToken: null });

/** Logout or token reuse: the devices of that one login. */
export async function revokeSessionDevices(db: Db, sessionFamilyId: string): Promise<void> {
  await db.device.updateMany({ where: { sessionFamilyId, revokedAt: null }, data: revoked() });
}

/** Log out everywhere, PIN change, PIN reset: every device of the user. */
export async function revokeUserDevices(db: Db, userId: string): Promise<void> {
  await db.device.updateMany({ where: { userId, revokedAt: null }, data: revoked() });
}
