// Start-up registration of every module's PendingAction handlers and jobs. Add a module's
// handlers and jobs here (the money modules register PAY, WITHDRAW, ... the same way).
import { pinResetApproveHandler } from './auth';
import { inviteCreateHandler } from './invites';
import { registerActionHandler } from './pending-actions';
import { registerPendingActionJobs } from './pending-actions/pending-actions.jobs';
import { proposalCreateHandler, voteCastHandler } from './proposals';

let registered = false;

/** Registers every action handler. Safe to call more than once. */
export function registerActionHandlers(): void {
  if (registered) return;
  registered = true;
  registerActionHandler(inviteCreateHandler);
  registerActionHandler(pinResetApproveHandler);
  registerActionHandler(proposalCreateHandler);
  registerActionHandler(voteCastHandler);
}

let jobsRegistered = false;

/** Registers every job processor and schedule (the server only; tests call processors directly). */
export function registerJobs(): void {
  if (jobsRegistered) return;
  jobsRegistered = true;
  registerPendingActionJobs();
}
