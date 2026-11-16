import { chatErrorTexts as t } from '@njangi/shared/i18n/server/chat';
import { defineErrors } from '../../lib/errors';

export const chatError = defineErrors({
  MESSAGE_NOT_FOUND: { status: 404, text: t.MESSAGE_NOT_FOUND },
  REPLY_TARGET_INVALID: { status: 400, text: t.REPLY_TARGET_INVALID },
  NOT_YOUR_MESSAGE: { status: 403, text: t.NOT_YOUR_MESSAGE },
  MESSAGE_ALREADY_REMOVED: { status: 409, text: t.MESSAGE_ALREADY_REMOVED },
  MESSAGE_NOT_HIDEABLE: { status: 409, text: t.MESSAGE_NOT_HIDEABLE },
  MENTION_NOT_A_MEMBER: { status: 400, text: t.MENTION_NOT_A_MEMBER },
  MESSAGE_ID_TAKEN: { status: 409, text: t.MESSAGE_ID_TAKEN },
  ATTACHMENT_NOT_USABLE: { status: 400, text: t.ATTACHMENT_NOT_USABLE },
});
