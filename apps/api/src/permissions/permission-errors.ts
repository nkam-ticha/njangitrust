// Maps a denial to the error the member sees. A non-member gets "not found" so the API never
// confirms that a group they don't belong to exists.
import { groupErrorTexts } from '@njangi/shared/i18n/server/groups';
import { commonErrorTexts } from '@njangi/shared/i18n/server/common';
import { defineErrors, type AppError } from '../lib/errors';
import type { DenialReason } from './can';

export const permissionError = defineErrors({
  GROUP_NOT_FOUND: { status: 404, text: groupErrorTexts.GROUP_NOT_FOUND },
  MEMBERSHIP_ENDED: { status: 403, text: groupErrorTexts.MEMBERSHIP_ENDED },
  NOT_ACTIVE_MEMBER: { status: 403, text: groupErrorTexts.NOT_ACTIVE_MEMBER },
  ADMIN_ONLY: { status: 403, text: groupErrorTexts.ADMIN_ONLY },
  GROUP_CLOSED: { status: 409, text: groupErrorTexts.GROUP_CLOSED },
  NOT_FOUND: { status: 404, text: commonErrorTexts.NOT_FOUND },
  FORBIDDEN: { status: 403, text: commonErrorTexts.FORBIDDEN },
});

export function denialToError(reason: DenialReason): AppError {
  switch (reason) {
    case 'NOT_A_MEMBER':
      return permissionError('GROUP_NOT_FOUND');
    case 'MEMBERSHIP_ENDED':
      return permissionError('MEMBERSHIP_ENDED');
    case 'NOT_ACTIVE_MEMBER':
      return permissionError('NOT_ACTIVE_MEMBER');
    case 'ADMIN_ONLY':
      return permissionError('ADMIN_ONLY');
    case 'GROUP_CLOSED':
      return permissionError('GROUP_CLOSED');
    case 'NOT_OWNER':
      // Someone else's record: answer as if it didn't exist.
      return permissionError('NOT_FOUND');
    case 'WRONG_RESOURCE':
      return permissionError('FORBIDDEN');
  }
}
