import { accountErrorTexts as t } from '@njangi/shared/i18n/server/account';
import { defineErrors } from '../../lib/errors';

export const accountError = defineErrors({
  NUMBER_NOT_VALID: { status: 400, text: t.NUMBER_NOT_VALID },
  OPERATOR_REQUIRED: { status: 400, text: t.OPERATOR_REQUIRED },
  NUMBER_UNCHANGED: { status: 409, text: t.NUMBER_UNCHANGED },
  ACCOUNT_DELETED: { status: 409, text: t.ACCOUNT_DELETED },
  DELETE_IS_ADMIN: { status: 409, text: t.DELETE_IS_ADMIN },
  DELETE_IN_RUNNING_CYCLE: { status: 409, text: t.DELETE_IN_RUNNING_CYCLE },
  DELETE_HAS_OBLIGATIONS: { status: 409, text: t.DELETE_HAS_OBLIGATIONS },
  DELETE_OPERATION_IN_PROGRESS: { status: 409, text: t.DELETE_OPERATION_IN_PROGRESS },
});
