import { pendingActionErrorTexts as t } from '@njangi/shared/i18n/server/pending-actions';
import { defineErrors } from '../../lib/errors';

export const actionError = defineErrors({
  ACTION_NOT_FOUND: { status: 404, text: t.ACTION_NOT_FOUND },
  ACTION_EXPIRED: { status: 410, text: t.ACTION_EXPIRED },
  ACTION_ALREADY_CONFIRMED: { status: 409, text: t.ACTION_ALREADY_CONFIRMED },
  ACTION_CANCELLED: { status: 409, text: t.ACTION_CANCELLED },
  ACTION_NOT_PENDING: { status: 409, text: t.ACTION_NOT_PENDING },
  ACTION_CHANGED: { status: 409, text: t.ACTION_CHANGED },
});

export type ActionErrorCode = Parameters<typeof actionError>[0];

/** Why a non-pending action can't be confirmed or cancelled. */
export function notPendingError(status: string) {
  switch (status) {
    case 'CONFIRMED':
    case 'DONE':
      return actionError('ACTION_ALREADY_CONFIRMED');
    case 'CANCELLED':
      return actionError('ACTION_CANCELLED');
    case 'EXPIRED':
      return actionError('ACTION_EXPIRED');
    default:
      return actionError('ACTION_NOT_PENDING');
  }
}
