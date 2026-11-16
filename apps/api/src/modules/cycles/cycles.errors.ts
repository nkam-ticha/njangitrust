import { commonErrorTexts } from '@njangi/shared/i18n/server/common';
import { defineErrors } from '../../lib/errors';

export const cycleError = defineErrors({
  CYCLE_ALREADY_STARTED: { status: 409, text: commonErrorTexts.CONFLICT },
  CYCLE_START_UNAVAILABLE: { status: 409, text: commonErrorTexts.CONFLICT },
});
