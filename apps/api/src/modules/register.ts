// Start-up registration of every module's PendingAction handlers and jobs. Add a module's
// handlers and jobs here (the money modules register PAY, WITHDRAW, ... the same way).
import { pinResetApproveHandler } from './auth';
import { startCycleHandler } from './groups';
import { inviteCreateHandler } from './invites';
import { leaveAtCycleEndHandler } from './members';
import { registerActionHandler } from './pending-actions';
import { registerNotificationJobs } from './notifications';
import { registerPendingActionJobs } from './pending-actions/pending-actions.jobs';
import { proposalCreateHandler, registerProposalJobs, voteCastHandler } from './proposals';

let registered = false;

/** Registers every action handler. Safe to call more than once. */
export function registerActionHandlers(): void {
  if (registered) return;
  registered = true;
  registerActionHandler(inviteCreateHandler);
  registerActionHandler(pinResetApproveHandler);
  registerActionHandler(proposalCreateHandler);
  registerActionHandler(voteCastHandler);
  registerActionHandler(startCycleHandler);
  registerActionHandler(leaveAtCycleEndHandler);
}

let jobsRegistered = false;

/** Registers every job processor and schedule. The server starts workers for them; without workers
 * (tests), due jobs run in-process (jobs/dispatch.ts). */
export function registerJobs(): void {
  if (jobsRegistered) return;
  jobsRegistered = true;
  registerPendingActionJobs();
  registerProposalJobs();
  registerNotificationJobs();
}
