import { randomUUID } from 'node:crypto';

export type ProviderStatus = 'PENDING' | 'SUCCESSFUL' | 'FAILED';

export interface PaymentProvider {
  requestPayment(input: {
    amount: number;
    phone: string;
    externalRef: string;
    description: string;
  }): Promise<{ providerRef: string; status: 'PENDING' }>;
  getPaymentStatus(providerRef: string): Promise<{
    status: ProviderStatus;
    operator?: 'MTN' | 'ORANGE';
    operatorRef?: string;
    fee?: number;
  }>;
  disburse(input: {
    amount: number;
    phone: string;
    externalRef: string;
    description: string;
  }): Promise<{ providerRef: string; status: 'PENDING' }>;
  getDisbursementStatus(providerRef: string): Promise<{ status: ProviderStatus; fee?: number }>;
  /** The balance of one provider account (Group.providerAccount); the default one when omitted. */
  getBalance(providerAccount?: string): Promise<{ total: number; mtn?: number; orange?: number }>;
}

/**
 * Rule 8: an operation is sent to the operator once. Before the call its row takes a claim in
 * place of the operator's reference; the real reference replaces it when the operator answers.
 * A row still holding a claim was sent and its answer lost: it is never sent again by itself.
 */
export const sendClaim = (): string => `claim:${randomUUID()}`;
export const isSendClaim = (providerRef: string): boolean => providerRef.startsWith('claim:');

/**
 * True when the provider says it certainly did not start the operation (a refusal such as an
 * invalid number or an insufficient balance). Anything else, a timeout above all, is unknown.
 */
export function providerRefused(error: unknown): boolean {
  return error instanceof Error && (error as { refused?: unknown }).refused === true;
}
