// Creating an account (spec 2.10, R13.1, Part 7 consent), used by sign-up and by accepting an
// invite as a new person. Checks and PIN hashing happen before any transaction is opened.
import { detectOperator, type Lang } from '@njangi/shared';
import { CURRENT_CONSENT_VERSION } from '@njangi/shared/contracts/auth';
import { clock } from '../../lib/clock';
import { isUniqueViolation, type Prisma } from '../../lib/prisma';
import { authError } from './auth.errors';
import { assertPinAcceptable, hashPin } from './pin';

export interface AccountInput {
  name: string;
  /** Normalised E.164. */
  phone: string;
  paymentNumber?: { number: string; operator?: 'MTN' | 'ORANGE' } | undefined;
  consentVersion: string;
  pin: string;
  language?: Lang | undefined;
}

export interface PreparedAccount {
  name: string;
  phone: string;
  paymentNumber: string;
  operator: 'MTN' | 'ORANGE';
  consentVersion: string;
  pinHash: string;
  language: Lang;
}

export async function prepareAccount(input: AccountInput): Promise<PreparedAccount> {
  if (input.consentVersion !== CURRENT_CONSENT_VERSION) throw authError('CONSENT_OUTDATED');
  const paymentNumber = input.paymentNumber?.number ?? input.phone;
  assertPinAcceptable(input.pin, [input.phone, paymentNumber]);
  const operator = input.paymentNumber?.operator ?? detectOperator(paymentNumber);
  if (operator === 'UNKNOWN') throw authError('OPERATOR_REQUIRED');
  return {
    name: input.name,
    phone: input.phone,
    paymentNumber,
    operator,
    consentVersion: input.consentVersion,
    pinHash: await hashPin(input.pin),
    language: input.language ?? 'fr',
  };
}

/** Inserts the user, their first payment number and default notification preferences. */
export async function insertAccount(
  tx: Prisma.TransactionClient,
  account: PreparedAccount,
): Promise<{ id: string; sessionEpoch: number }> {
  const now = clock.now();
  const existing = await tx.user.findUnique({ where: { loginPhone: account.phone }, select: { id: true } });
  if (existing) throw authError('PHONE_ALREADY_REGISTERED');
  try {
    return await tx.user.create({
      data: {
        name: account.name,
        loginPhone: account.phone,
        pinHash: account.pinHash,
        language: account.language,
        consentVersion: account.consentVersion,
        consentAt: now,
        paymentNumbers: {
          create: { number: account.paymentNumber, operator: account.operator, activeFrom: now },
        },
        notificationPrefs: { create: {} },
      },
      select: { id: true, sessionEpoch: true },
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw authError('PHONE_ALREADY_REGISTERED');
    throw error;
  }
}
