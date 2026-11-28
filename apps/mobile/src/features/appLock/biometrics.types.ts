// What the phone's biometrics offer, behind one small interface (the module does not exist on web).
export type BiometricAvailability = 'ok' | 'noHardware' | 'notEnrolled' | 'web';

/** `unavailable`: the phone cannot check (nothing enrolled, no hardware): the lock must not trap the member. */
export type BiometricResult = 'success' | 'cancelled' | 'failed' | 'unavailable';

export interface Biometrics {
  availability(): Promise<BiometricAvailability>;
  authenticate(options: { prompt: string; cancel: string }): Promise<BiometricResult>;
}
