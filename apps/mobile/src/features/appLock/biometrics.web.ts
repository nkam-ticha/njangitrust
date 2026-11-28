// Web: no biometric lock (D1). The setting is hidden.
import type { Biometrics } from './biometrics.types';

export const biometrics: Biometrics = {
  availability: () => Promise.resolve('web'),
  authenticate: () => Promise.resolve('unavailable'),
};
