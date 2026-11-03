// PIN hashing (spec 2.2, 2.10): argon2id with the OWASP parameters (19 MiB, 2 passes, 1 lane).
import argon2 from 'argon2';
import { authError } from './auth.errors';
import { isGuessablePin } from './pin-policy';

const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPin(pin: string): Promise<string> {
  return argon2.hash(pin, OPTIONS);
}

export async function verifyPin(pinHash: string, pin: string): Promise<boolean> {
  try {
    return await argon2.verify(pinHash, pin);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Spends the same time as a real check, for unknown phone numbers: a login answers alike whether
 * or not the phone has an account (no enumeration by timing).
 */
export async function burnPinCheck(pin: string): Promise<void> {
  dummyHash ??= argon2.hash('njangitrust-no-such-account', OPTIONS);
  await verifyPin(await dummyHash, pin);
}

/** Refuses guessable PINs, including digits of the member's own numbers. */
export function assertPinAcceptable(pin: string, ownNumbers: readonly string[]): void {
  if (isGuessablePin(pin, ownNumbers)) throw authError('PIN_TOO_WEAK');
}
