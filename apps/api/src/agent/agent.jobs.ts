// The agent's jobs (spec 2.9). Work that needs a model call and is not a member's own request (an
// action's result, an @njangi mention in the group chat) runs as a durable job: the request that
// caused it only queues ids, and the job runner (the cron function in production, in-process in
// tests) does the turn. Each job runs at most one turn, inside the same time budget as a request.
import { registerJob } from '../jobs/registry';
import { ACTION_RESULT_JOB, handleActionResult, type ActionResultJob } from './service/events';
import { answerGroupMention, GROUP_MENTION_JOB, type GroupMention } from './service/group';

let registered = false;

/** Start-up (modules/register.ts, WIRING LIST item 1). Safe to call more than once. */
export function registerAgentJobs(): void {
  if (registered) return;
  registered = true;
  // One attempt: a second run could answer twice. The event line itself is recorded once.
  registerJob<ActionResultJob>({
    name: ACTION_RESULT_JOB,
    attempts: 1,
    keepNoHistory: true,
    process: (job) => handleActionResult(job.data),
  });
  registerJob<GroupMention>({
    name: GROUP_MENTION_JOB,
    attempts: 1,
    keepNoHistory: true,
    process: (job) => answerGroupMention(job.data),
  });
}
