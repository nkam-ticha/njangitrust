// Phones: fingerprint or face through expo-local-authentication (D4). The phone's own passcode may
// stand in when the biometric fails (the system decides); the member's NjangiTrust PIN is never used here.
import * as LocalAuthentication from 'expo-local-authentication';
import type { Biometrics } from './biometrics.types';

export const biometrics: Biometrics = {
  async availability() {
    try {
      if (!(await LocalAuthentication.hasHardwareAsync())) return 'noHardware';
      if (!(await LocalAuthentication.isEnrolledAsync())) return 'notEnrolled';
      return 'ok';
    } catch {
      return 'noHardware';
    }
  },
  async authenticate({ prompt, cancel }) {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: prompt,
        cancelLabel: cancel,
      });
      if (result.success) return 'success';
      switch (result.error) {
        case 'not_enrolled':
        case 'not_available':
        case 'passcode_not_set':
          return 'unavailable';
        case 'user_cancel':
        case 'app_cancel':
        case 'system_cancel':
          return 'cancelled';
        default:
          return 'failed';
      }
    } catch {
      return 'unavailable';
    }
  },
};
