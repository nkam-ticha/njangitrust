import { proposalErrorTexts as t } from '@njangi/shared/i18n/server/proposals';
import { defineErrors } from '../../lib/errors';

export const proposalError = defineErrors({
  PROPOSAL_NOT_FOUND: { status: 404, text: t.PROPOSAL_NOT_FOUND },
  PROPOSALS_BEFORE_FIRST_CYCLE: { status: 409, text: t.PROPOSALS_BEFORE_FIRST_CYCLE },
  PROPOSAL_CLOSED: { status: 409, text: t.PROPOSAL_CLOSED },
  NOT_ELIGIBLE_VOTER: { status: 403, text: t.NOT_ELIGIBLE_VOTER },
  ALREADY_VOTED: { status: 409, text: t.ALREADY_VOTED },
});
