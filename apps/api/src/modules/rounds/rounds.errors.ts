import { commonErrorTexts } from '@njangi/shared/i18n/server/common';
import { defineErrors } from '../../lib/errors';

const errors = defineErrors({
  ROUND_NOT_FOUND: { status: 404, text: commonErrorTexts.NOT_FOUND },
  PAYOUT_NOT_ASSIGNED: { status: 409, text: commonErrorTexts.CONFLICT },
});

export const roundError = errors;
