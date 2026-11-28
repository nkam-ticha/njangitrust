// The /v1 routes (spec 2.7). Each module owns its routes file; this only mounts them.
import { Router } from 'express';
import { authRoutes } from '../modules/auth/auth.routes';
import { pinResetGroupRoutes, pinResetOwnerRoutes } from '../modules/auth/pin-reset.routes';
import { devicesRoutes } from '../modules/devices/devices.routes';
import { groupsRoutes } from '../modules/groups/groups.routes';
import { invitePublicRoutes, inviteGroupRoutes } from '../modules/invites/invites.routes';
import { accountRoutes } from '../modules/account';
import { meRoutes } from '../modules/me/me.routes';
import { meGroupRoutes } from '../modules/me/me.group-routes';
import { membersRoutes } from '../modules/members/members.routes';
import {
  notificationPrefsRoutes,
  notificationsRoutes,
} from '../modules/notifications/notifications.routes';
import { pendingActionsRoutes } from '../modules/pending-actions/pending-actions.routes';
import { proposalGroupRoutes, proposalRoutes } from '../modules/proposals/proposals.routes';
import { solidarityRoutes } from '../modules/solidarity/solidarity.routes';
import { rulesetsRoutes } from '../modules/rulesets/rulesets.routes';
import { roundsRoutes } from '../modules/rounds/rounds.routes';
import { cyclesRoutes } from '../modules/cycles/cycles.routes';
import { paymentGroupRoutes, paymentRoutes } from '../modules/payments';
import { payoutRoutes, withdrawalRoutes } from '../modules/payouts';
import { loanGroupRoutes, loanDecisionRoutes } from '../modules/loans';
import { bidsRoutes } from '../modules/bids';
import { ledgerRoutes } from '../modules/ledger';
import { reconciliationRoutes } from '../modules/reconciliation';
import { chatGroupRoutes, chatMessageRoutes, chatUnreadRoutes } from '../modules/chat';
import { attachmentRoutes, mediaGroupRoutes } from '../modules/media';
import { meetingRoutes, meetingsGroupRoutes } from '../modules/meetings';
import { meStatementRoutes, verifyRoutes } from '../modules/statements';
import { auditExportRoutes } from '../modules/audit-export';
import { developerRoutes } from '../modules/developer';
import { agentRoutes } from '../agent';

export function v1Router(): Router {
  const v1 = Router();

  v1.use('/developer', developerRoutes());
  v1.use('/auth/invites', invitePublicRoutes());
  v1.use('/auth', authRoutes());

  v1.use('/me/devices', devicesRoutes());
  v1.use('/me/pin-reset', pinResetOwnerRoutes());
  v1.use('/me/notification-prefs', notificationPrefsRoutes());
  v1.use('/me/statements', meStatementRoutes());
  v1.use('/me', accountRoutes());
  v1.use('/me', meRoutes());

  // Chat, media, meetings and the audit export come before the other group routers.
  v1.use('/groups', chatGroupRoutes());
  v1.use('/groups', mediaGroupRoutes());
  v1.use('/groups', meetingsGroupRoutes());
  v1.use('/groups', auditExportRoutes());
  v1.use('/messages', chatMessageRoutes());
  v1.use('/chat', chatUnreadRoutes());
  v1.use('/attachments', attachmentRoutes());
  v1.use('/meetings', meetingRoutes());
  // Public: statement authenticity (2.14).
  v1.use('/verify', verifyRoutes());

  v1.use('/groups', meGroupRoutes());
  v1.use('/groups', groupsRoutes());
  v1.use('/groups', roundsRoutes());
  v1.use('/groups', cyclesRoutes());
  v1.use('/groups', paymentGroupRoutes());
  v1.use('/groups', payoutRoutes());
  v1.use('/groups', loanGroupRoutes());
  v1.use('/groups', bidsRoutes());
  v1.use('/groups', ledgerRoutes());
  v1.use('/groups', reconciliationRoutes());
  v1.use('/groups', membersRoutes());
  v1.use('/groups', rulesetsRoutes());
  v1.use('/groups', inviteGroupRoutes());
  v1.use('/groups', proposalGroupRoutes());
  v1.use('/groups', pinResetGroupRoutes());
  v1.use('/groups', solidarityRoutes());

  v1.use('/proposals', proposalRoutes());
  v1.use('/pending-actions', pendingActionsRoutes());
  v1.use('/notifications', notificationsRoutes());
  v1.use('/payments', paymentRoutes());
  v1.use('/withdrawals', withdrawalRoutes());
  v1.use('/loans', loanDecisionRoutes());
  v1.use('/agent', agentRoutes());

  return v1;
}
