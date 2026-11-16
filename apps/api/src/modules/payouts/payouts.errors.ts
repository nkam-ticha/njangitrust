import { commonErrorTexts } from '@njangi/shared/i18n/server/common';
import { defineErrors } from '../../lib/errors';

export const payoutError = defineErrors({
  ACTION_NOT_AVAILABLE: { status: 409, text: commonErrorTexts.CONFLICT },
  DISBURSEMENTS_PAUSED: { status: 409, text: commonErrorTexts.SERVICE_UNAVAILABLE },
  HOLD_ACTIVE: { status: 409, text: commonErrorTexts.CONFLICT },
  NO_ACTIVE_PAYMENT_NUMBER: { status: 409, text: commonErrorTexts.CONFLICT },
  WITHDRAWAL_IN_PROGRESS: { status: 409, text: commonErrorTexts.CONFLICT },
  NOTHING_TO_WITHDRAW: { status: 409, text: commonErrorTexts.CONFLICT },
  BELOW_MINIMUM_WITHDRAWAL: { status: 400, text: commonErrorTexts.VALIDATION_FAILED },
  ABOVE_AVAILABLE: { status: 409, text: commonErrorTexts.CONFLICT },
  INVALID_AMOUNT: { status: 400, text: commonErrorTexts.VALIDATION_FAILED },
});
