// Devices for push notifications (spec 2.7 POST /me/devices, 2.13). A push token belongs to one
// device of one user: registering it again (another account on the same phone) moves it.
import type { RegisterDeviceRequest } from '@njangi/shared/contracts/me';
import { clock } from '../../lib/clock';
import { getPrisma } from '../../lib/prisma';

export interface DeviceSource {
  id: string;
  platform: 'ANDROID' | 'IOS' | 'WEB';
  expoPushToken: string | null;
  lastSeenAt: Date;
}

export async function registerDevice(userId: string, input: RegisterDeviceRequest): Promise<DeviceSource> {
  const prisma = getPrisma();
  const now = clock.now();
  const select = { id: true, platform: true, expoPushToken: true, lastSeenAt: true } as const;
  if (input.expoPushToken) {
    return prisma.device.upsert({
      where: { expoPushToken: input.expoPushToken },
      create: { userId, platform: input.platform, expoPushToken: input.expoPushToken, lastSeenAt: now },
      update: { userId, platform: input.platform, lastSeenAt: now, revokedAt: null },
      select,
    });
  }
  return prisma.device.create({ data: { userId, platform: input.platform, lastSeenAt: now }, select });
}
