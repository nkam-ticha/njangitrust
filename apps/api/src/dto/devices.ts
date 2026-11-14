// Device mapper. Allowlist: the push token itself never goes back to the client.
import type { DeviceDto } from '@njangi/shared/contracts/me';
import { iso } from './time';

export interface DeviceSource {
  id: string;
  platform: 'ANDROID' | 'IOS' | 'WEB';
  expoPushToken: string | null;
  lastSeenAt: Date;
}

export function toDevice(device: DeviceSource): DeviceDto {
  return {
    id: device.id,
    platform: device.platform,
    pushEnabled: device.expoPushToken !== null,
    lastSeenAt: iso(device.lastSeenAt),
  };
}
