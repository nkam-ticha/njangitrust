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
