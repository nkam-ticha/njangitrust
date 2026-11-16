import { statementErrorTexts as t } from '@njangi/shared/i18n/server/statements';
import { defineErrors } from '../../lib/errors';

export const statementError = defineErrors({
  STATEMENT_NOT_FOUND: { status: 404, text: t.STATEMENT_NOT_FOUND },
  PERIOD_ENDS_BEFORE_START: { status: 400, text: t.PERIOD_ENDS_BEFORE_START },
  PERIOD_TOO_LONG: { status: 400, text: t.PERIOD_TOO_LONG },
  PERIOD_INVALID: { status: 400, text: t.PERIOD_INVALID },
  PERIOD_IN_THE_FUTURE: { status: 400, text: t.PERIOD_IN_THE_FUTURE },
  CYCLE_NOT_FOUND: { status: 404, text: t.CYCLE_NOT_FOUND },
});
