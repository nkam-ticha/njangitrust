import { developerErrorTexts as t } from '@njangi/shared/i18n/server/developer';
import { defineErrors } from '../../lib/errors';

export const developerError = defineErrors({
  DEVELOPER_LOGIN_INVALID: { status: 401, text: t.DEVELOPER_LOGIN_INVALID },
  DEVELOPER_LOCKED: { status: 429, text: t.DEVELOPER_LOCKED },
  DEVELOPER_UNAUTHENTICATED: { status: 401, text: t.DEVELOPER_UNAUTHENTICATED },
  USER_NOT_FOUND: { status: 404, text: t.USER_NOT_FOUND },
  USER_ALREADY_DELETED: { status: 409, text: t.USER_ALREADY_DELETED },
  GROUP_NOT_FOUND: { status: 404, text: t.GROUP_NOT_FOUND },
  DELETE_IS_ADMIN: { status: 409, text: t.DELETE_IS_ADMIN },
  DELETE_IN_RUNNING_CYCLE: { status: 409, text: t.DELETE_IN_RUNNING_CYCLE },
  DELETE_HAS_OBLIGATIONS: { status: 409, text: t.DELETE_HAS_OBLIGATIONS },
  DELETE_OPERATION_IN_PROGRESS: { status: 409, text: t.DELETE_OPERATION_IN_PROGRESS },
});
