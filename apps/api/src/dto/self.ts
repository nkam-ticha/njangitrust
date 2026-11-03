// `toSelf` (spec 2.11): the only mapper that outputs a full phone number, and only to its owner.
// Every response is built field by field from an allowlist, never by deleting fields.
import { maskNumber, type Lang } from '@njangi/shared';
import type { SelfDto } from '@njangi/shared/contracts/me';
import { iso } from './time';

export interface SelfSource {
  user: {
    id: string;
    name: string;
    loginPhone: string;
    language: Lang;
    consentVersion: string;
    consentAt: Date;
    createdAt: Date;
  };
  paymentNumber: { number: string; operator: 'MTN' | 'ORANGE' | 'UNKNOWN'; activeFrom: Date } | null;
}

/** Call only with the requester's own record. */
export function toSelf({ user, paymentNumber }: SelfSource): SelfDto {
  return {
    id: user.id,
    name: user.name,
    phone: user.loginPhone,
    language: user.language,
    consentVersion: user.consentVersion,
    consentAt: iso(user.consentAt),
    paymentNumber: paymentNumber
      ? {
          number: paymentNumber.number,
          masked: maskNumber(paymentNumber.number),
          operator: paymentNumber.operator,
          activeFrom: iso(paymentNumber.activeFrom),
        }
      : null,
    createdAt: iso(user.createdAt),
  };
}
