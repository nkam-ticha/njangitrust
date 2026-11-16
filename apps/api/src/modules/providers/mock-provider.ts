// Deterministic local provider (spec 2.6). It keeps nothing in memory: on serverless hosting the
// request that starts an operation and the job that checks it run in different processes, so the
// reference itself carries what the status needs (kind, outcome, start time, amount). The balance
// is read through `settledBalance`, which the module wires to the operations already settled.
import { MOCK_FEE_SCHEDULE, scheduleFee, type FeeSchedule } from '@njangi/rules';
import { clock } from '../../lib/clock';
import type { PaymentProvider, ProviderStatus } from './payment-provider';

type Kind = 'payment' | 'disbursement';
type Outcome = 'S' | 'F' | 'P';

interface Operation {
  kind: Kind;
  outcome: Outcome;
  operator: 'MTN' | 'ORANGE';
  createdAt: number;
  amount: number;
}

/** A successful operation is confirmed this long after it starts. */
export const MOCK_CONFIRMATION_MS = 3_000;

const REF = /^MOCK-(C|D)-(S|F|P)-(M|O)-([0-9a-z]+)-([0-9]+)-(.+)$/;

/** Test numbers: one ending in 000 is refused, one ending in 111 never answers. */
function outcomeOf(phone: string): Outcome {
  const digits = phone.replace(/\D/g, '');
  return digits.endsWith('000') ? 'F' : digits.endsWith('111') ? 'P' : 'S';
}

function encode(kind: Kind, input: { amount: number; phone: string; externalRef: string }): string {
  const operator = input.phone.replace(/\D/g, '').startsWith('23767') ? 'M' : 'O';
  return [
    'MOCK',
    kind === 'payment' ? 'C' : 'D',
    outcomeOf(input.phone),
    operator,
    clock.nowMs().toString(36),
    String(input.amount),
    input.externalRef,
  ].join('-');
}

function decode(providerRef: string, kind: Kind): Operation | null {
  const match = REF.exec(providerRef);
  if (!match) return null;
  const found: Kind = match[1] === 'C' ? 'payment' : 'disbursement';
  if (found !== kind) return null;
  const amount = Number(match[5]);
  const createdAt = parseInt(match[4]!, 36);
  if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(createdAt)) return null;
  return {
    kind,
    outcome: match[2] as Outcome,
    operator: match[3] === 'M' ? 'MTN' : 'ORANGE',
    createdAt,
    amount,
  };
}

function statusOf(operation: Operation): ProviderStatus {
  if (operation.outcome === 'F') return 'FAILED';
  if (operation.outcome === 'P') return 'PENDING';
  return clock.nowMs() - operation.createdAt < MOCK_CONFIRMATION_MS ? 'PENDING' : 'SUCCESSFUL';
}

export class MockProvider implements PaymentProvider {
  constructor(
    private readonly settledBalance: (providerAccount: string) => Promise<number> = () =>
      Promise.resolve(0),
    /** The fees this operator charges: the app's configured schedule, so estimates match. */
    private readonly fees: () => FeeSchedule = () => MOCK_FEE_SCHEDULE,
  ) {}

  requestPayment(input: Parameters<PaymentProvider['requestPayment']>[0]) {
    return Promise.resolve({ providerRef: encode('payment', input), status: 'PENDING' as const });
  }

  getPaymentStatus(providerRef: string) {
    const operation = decode(providerRef, 'payment');
    if (!operation) return Promise.reject(new Error('Unknown mock payment reference'));
    const status = statusOf(operation);
    return Promise.resolve({
      status,
      ...(status === 'SUCCESSFUL'
        ? {
            operator: operation.operator,
            operatorRef: providerRef,
            fee: scheduleFee(this.fees(), 'COLLECTION', operation.amount),
          }
        : {}),
    });
  }

  disburse(input: Parameters<PaymentProvider['disburse']>[0]) {
    return Promise.resolve({
      providerRef: encode('disbursement', input),
      status: 'PENDING' as const,
    });
  }

  getDisbursementStatus(providerRef: string) {
    const operation = decode(providerRef, 'disbursement');
    if (!operation) return Promise.reject(new Error('Unknown mock disbursement reference'));
    const status = statusOf(operation);
    return Promise.resolve({
      status,
      ...(status === 'SUCCESSFUL'
        ? { fee: scheduleFee(this.fees(), 'DISBURSEMENT', operation.amount) }
        : {}),
    });
  }

  async getBalance(providerAccount = 'default') {
    return { total: await this.settledBalance(providerAccount) };
  }
}
