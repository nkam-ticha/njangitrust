// PAYMENT_RECEIVED (2.5) with the fee metadata it must carry (R4.4): the fee, where it came from,
// and each part's share (R4.2). Disbursements are in disbursement-postings.ts (D18.1).

import {
  splitCollectionFee,
  type FeeSource,
  type PaymentPart,
  type PaymentPartKind,
  type PaymentPartWithFee,
} from '../fees';
import type { Fcfa } from '../money';
import {
  CASH_PROVIDER,
  GENERAL_FUND,
  payableAccount,
  potAccount,
  receivableAccount,
  SOLIDARITY_FUND,
} from './accounts';
import { post } from './lines';
import type { Posting } from './types';

/** R4.2, R4.4: one part of a payment as recorded in PAYMENT_RECEIVED metadata. */
export type PaymentPartRecord = {
  obligationId: string | null;
  kind: PaymentPartKind;
  amount: Fcfa;
  feeShare: Fcfa;
  tieOrder: number;
  /** The account the part credits (payable, pot, solidarity fund, or the payer's receivable). */
  account: string;
  /** D22.2: only on a correction debt's part, when its payer added the fee (above zero). */
  feeCharged?: Fcfa;
};

/** R4.4: PAYMENT_RECEIVED metadata. */
export type PaymentFeeMetadata = { fee: Fcfa; feeSource: FeeSource; parts: PaymentPartRecord[] };

/**
 * R4.2: what a non-debt part credits after its fee share (amount - feeShare). The one definition:
 * paymentReceivedPostings posts it, and the withdrawal check reads it back from the recorded
 * metadata (lockedPayoutCredits), so the two cannot disagree. Never below zero.
 */
export function partNetCredit(part: { amount: Fcfa; feeShare: Fcfa }): Fcfa {
  return Math.max(0, part.amount - part.feeShare);
}

function partAccount(part: PaymentPartWithFee, payer: string): string {
  switch (part.kind) {
    case 'CONTRIBUTION':
      return part.potRoundId
        ? potAccount(part.potRoundId)
        : payableAccount(part.creditorMembershipId!);
    case 'SHORTFALL':
      return payableAccount(part.creditorMembershipId!);
    case 'SOLIDARITY':
      return SOLIDARITY_FUND;
    case 'DEBT':
      return receivableAccount(payer);
  }
}

/**
 * 2.5 PAYMENT_RECEIVED, R4.2, R4.4: cash +(total − fee); each part net of its fee share goes to the
 * beneficiary's payable (or the round pot), the leaver's payable, or the solidarity fund; a debt part
 * clears the payer's receivable in full and the general fund bears its fee share, except what the
 * payer added for it (D22.2 `feeCharged`: receivable −(amount − feeCharged), general fund
 * +(feeShare − feeCharged), a credit when the actual fee came out below the estimate). Parts must be
 * resolved first (resolvePaymentParts).
 */
export function paymentReceivedPostings(input: {
  payerMembershipId: string;
  fee: Fcfa;
  feeSource: FeeSource;
  parts: readonly PaymentPart[];
}): { postings: Posting[]; parts: PaymentPartWithFee[]; metadata: PaymentFeeMetadata } {
  const parts = splitCollectionFee(input.parts, input.fee);
  const total = parts.reduce((sum, p) => sum + p.amount, 0);
  if (input.fee >= total) throw new RangeError('the fee must be below the payment (L1)');
  const postings: Posting[] = [];
  post(postings, CASH_PROVIDER, total - input.fee);
  const records: PaymentPartRecord[] = [];
  for (const part of parts) {
    const account = partAccount(part, input.payerMembershipId);
    const charged = part.feeCharged ?? 0;
    if (part.kind === 'DEBT') {
      post(postings, account, -(part.amount - charged));
      post(postings, GENERAL_FUND, part.feeShare - charged);
    } else {
      post(postings, account, -partNetCredit(part));
    }
    records.push({
      obligationId: part.ref ?? null,
      kind: part.kind,
      amount: part.amount,
      feeShare: part.feeShare,
      tieOrder: part.tieOrder ?? 0,
      account,
      ...(charged > 0 ? { feeCharged: charged } : {}),
    });
  }
  return {
    postings,
    parts,
    metadata: { fee: input.fee, feeSource: input.feeSource, parts: records },
  };
}
