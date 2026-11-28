// Web: no push (D1). Every call answers "not here"; the screen hides the push settings.
import type { PushDevice } from './pushDevice.types';

export const pushDevice: PushDevice = {
  support: () => 'web',
  platform: () => 'WEB',
  permission: () => Promise.resolve('denied'),
  ask: () => Promise.resolve('denied'),
  token: () => Promise.reject(new Error('PUSH_UNSUPPORTED')),
  onTap: () => () => undefined,
};
