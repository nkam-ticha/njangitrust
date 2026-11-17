// Start-up registration of every module's PendingAction handlers and jobs. Add a module's
// handlers and jobs here (the money modules register PAY, WITHDRAW, ... the same way).
import { pinResetApproveHandler } from './auth';
import { startCycleHandler } from './groups';
import { inviteCreateHandler } from './invites';
import { leaveAtCycleEndHandler } from './members';
import { registerActionHandler } from './pending-actions';
import { registerNotificationJobs } from './notifications';
import { registerMeetingJobs } from './meetings/meetings.jobs';
import { chatAnnounceHandler, chatHideHandler, chatPostHandler } from './chat';
import {
  meetingAgendaAddHandler,
  meetingAttendanceHandler,
  meetingCancelHandler,
  meetingCheckInHandler,
  meetingCloseHandler,
  meetingExcuseHandler,
  meetingPublishMinutesHandler,
  meetingScheduleHandler,
} from './meetings';
import { registerStatementJobs } from './statements';
import { registerPendingActionJobs } from './pending-actions/pending-actions.jobs';
import { proposalCreateHandler, registerProposalJobs, voteCastHandler } from './proposals';
import { payHandler, pollPaymentIntent, registerPaymentJobs } from './payments';
import { pollDisbursement } from './payouts/withdrawals.service';
import { registerCampayRechecks } from './providers';
import { withdrawHandler, registerDisbursementJobs, registerPayoutJobs } from './payouts';
import { applyRotationChange, currentRotation, registerCycleJobs, startFirstCycle } from './cycles';
import {
  configuredFeeSchedule,
  decideAdminLoanByVote,
  decideLoanHandler,
  registerLoanDisbursementJob,
  requestLoanHandler,
  scheduleApprovedLoanDisbursement,
} from './loans';
import { registerFineJobs } from './fines';
import { registerReconciliationJobs } from './reconciliation';
import { placeBidHandler, registerBiddingJobs } from './bids';
import { registerGovernancePorts } from './proposals';
import { appendLedgerEntry } from './ledger';
import {
  onGroupMention,
  onPendingActionUpdated,
  registerAgentAdapters,
  registerAgentJobs,
} from '../agent';
import { registerAgentPort } from './chat';
import { onPendingActionAnnounced } from './pending-actions';

let agentWired = false;

/** The agent Njangi: its ports on the services that exist, the chat's @njangi mentions, and the
 * results of the actions it prepared (spec 4.4, 4.5). Needed by the API and by the cron runner. */
function wireAgent(): void {
  if (agentWired) return;
  agentWired = true;
  registerAgentAdapters();
  registerAgentPort({ onGroupMention });
  onPendingActionAnnounced(onPendingActionUpdated);
}

let registered = false;

/** Registers every action handler. Safe to call more than once. */
export function registerActionHandlers(): void {
  wireAgent();
  if (registered) return;
  registered = true;
  registerActionHandler(inviteCreateHandler);
  registerActionHandler(pinResetApproveHandler);
  registerActionHandler(proposalCreateHandler);
  registerActionHandler(voteCastHandler);
  registerActionHandler(startCycleHandler);
  registerActionHandler(leaveAtCycleEndHandler);
  registerActionHandler(payHandler);
  registerActionHandler(withdrawHandler);
  registerActionHandler(requestLoanHandler);
  registerActionHandler(decideLoanHandler);
  registerActionHandler(placeBidHandler);
  registerActionHandler(chatPostHandler);
  registerActionHandler(chatAnnounceHandler);
  registerActionHandler(chatHideHandler);
  registerActionHandler(meetingScheduleHandler);
  registerActionHandler(meetingCancelHandler);
  registerActionHandler(meetingCloseHandler);
  registerActionHandler(meetingAttendanceHandler);
  registerActionHandler(meetingPublishMinutesHandler);
  registerActionHandler(meetingCheckInHandler);
  registerActionHandler(meetingExcuseHandler);
  registerActionHandler(meetingAgendaAddHandler);
}

let governancePortsRegistered = false;
function registerMoneyLedgerEvents(): void {
  if (governancePortsRegistered) return;
  governancePortsRegistered = true;
  registerGovernancePorts({
    ledgerEvents: {
      async appendEvent(tx, input) {
        await appendLedgerEntry(tx, input.groupId, {
          type: 'EVENT',
          occurredAt: input.occurredAt.toISOString(),
          roundId: null,
          membershipId: input.membershipId ?? null,
          refType: input.refType,
          refId: input.refId,
          descriptionFr: input.description.fr,
          descriptionEn: input.description.en,
          metadata: input.event,
          postings: [],
        });
      },
    },
    // The operations the money modules have built. The others (rule re-dating, rotation change,
    // exit settlement, fine waiver, ledger correction, solidarity payout) are not written yet, so
    // the governance that needs them stays "not available".
    money: {
      startCycle: startFirstCycle,
      currentRotation,
      applyRotationChange,
      feeSchedule: configuredFeeSchedule,
      async decideAdminLoan(tx, input, effects) {
        await decideAdminLoanByVote(tx, input);
        if (input.approved) effects.add(() => scheduleApprovedLoanDisbursement(input.loanId));
      },
    },
  });
}

let jobsRegistered = false;

/** Registers every job processor and schedule. The server starts workers for them; without workers
 * (tests), due jobs run in-process (jobs/dispatch.ts). */
export function registerJobs(): void {
  wireAgent();
  if (jobsRegistered) return;
  jobsRegistered = true;
  registerAgentJobs();
  registerMoneyLedgerEvents();
  registerPendingActionJobs();
  registerProposalJobs();
  registerNotificationJobs();
  registerMeetingJobs();
  registerCycleJobs();
  registerPaymentJobs();
  registerCampayRechecks({ payment: pollPaymentIntent, disbursement: pollDisbursement });
  registerPayoutJobs();
  registerDisbursementJobs();
  registerLoanDisbursementJob();
  registerFineJobs();
  registerBiddingJobs();
  registerReconciliationJobs();
  registerStatementJobs();
}
