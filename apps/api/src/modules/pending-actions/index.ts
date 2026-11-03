// Public surface of the PendingAction framework. Modules (and later the agent's tools) can create
// and read actions and register handlers. Confirmation is deliberately NOT exported: it is
// reachable only through POST /v1/pending-actions/:id/confirm, called by the app (spec 4.5).
export {
  defineActionHandler,
  type ActionContext,
  type ActionHandler,
  type ActionLevel,
  type ActionOrigin,
  type ExecuteContext,
  type ExecuteResult,
} from './pending-actions.types';
export { getActionHandler, registerActionHandler, registeredActionTypes } from './registry';
export {
  ACTION_TTL_MS,
  completePendingAction,
  createPendingAction,
  expireDuePendingActions,
  getOwnPendingAction,
  type CreateActionInput,
} from './pending-actions.service';
export { actionError } from './pending-actions.errors';
