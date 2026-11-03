// The /v1 routes (spec 2.7). Each module owns its routes file; this only mounts them.
import { Router } from 'express';
import { authRoutes } from '../modules/auth/auth.routes';
import { pinResetGroupRoutes } from '../modules/auth/pin-reset.routes';
import { devicesRoutes } from '../modules/devices/devices.routes';
import { groupsRoutes } from '../modules/groups/groups.routes';
import { invitePublicRoutes, inviteGroupRoutes } from '../modules/invites/invites.routes';
import { meRoutes } from '../modules/me/me.routes';
import { membersRoutes } from '../modules/members/members.routes';
import { pendingActionsRoutes } from '../modules/pending-actions/pending-actions.routes';
import { proposalGroupRoutes, proposalRoutes } from '../modules/proposals/proposals.routes';
import { rulesetsRoutes } from '../modules/rulesets/rulesets.routes';

export function v1Router(): Router {
  const v1 = Router();

  v1.use('/auth/invites', invitePublicRoutes());
  v1.use('/auth', authRoutes());

  v1.use('/me/devices', devicesRoutes());
  v1.use('/me', meRoutes());

  v1.use('/groups', groupsRoutes());
  v1.use('/groups', membersRoutes());
  v1.use('/groups', rulesetsRoutes());
  v1.use('/groups', inviteGroupRoutes());
  v1.use('/groups', proposalGroupRoutes());
  v1.use('/groups', pinResetGroupRoutes());

  v1.use('/proposals', proposalRoutes());
  v1.use('/pending-actions', pendingActionsRoutes());

  return v1;
}
