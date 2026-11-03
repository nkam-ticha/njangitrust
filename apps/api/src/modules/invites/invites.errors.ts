import { groupErrorTexts as t } from '@njangi/shared/i18n/server/groups';
import { defineErrors } from '../../lib/errors';

export const inviteError = defineErrors({
  GROUP_FULL: { status: 409, text: t.GROUP_FULL },
  GROUP_CLOSED: { status: 409, text: t.GROUP_CLOSED },
  PROPOSAL_REQUIRED: { status: 409, text: t.PROPOSAL_REQUIRED },
  PROPOSAL_NOT_PASSED: { status: 409, text: t.PROPOSAL_NOT_PASSED },
  PROPOSAL_PHONE_MISMATCH: { status: 400, text: t.PROPOSAL_PHONE_MISMATCH },
  PROPOSAL_ALREADY_USED: { status: 409, text: t.PROPOSAL_ALREADY_USED },
  INVITE_ALREADY_PENDING: { status: 409, text: t.INVITE_ALREADY_PENDING },
  INVITE_NOT_FOUND: { status: 404, text: t.INVITE_NOT_FOUND },
  INVITE_EXPIRED: { status: 410, text: t.INVITE_EXPIRED },
  INVITE_USED: { status: 410, text: t.INVITE_USED },
  INVITE_PHONE_MISMATCH: { status: 403, text: t.INVITE_PHONE_MISMATCH },
  ALREADY_MEMBER: { status: 409, text: t.ALREADY_MEMBER },
});
