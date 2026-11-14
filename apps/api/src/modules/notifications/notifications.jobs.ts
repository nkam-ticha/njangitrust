// Notification jobs (spec 2.9, 2.13, FSD NOT-01): pushes, push receipts, and the hourly reminders.
// Reminders come from the money modules (who owes what, when), registered as reminder sources.
import type { Job } from 'bullmq';
import { AfterCommit } from '../../lib/after-commit';
import { clock } from '../../lib/clock';
import { registerJob, registerRepeatable } from '../../jobs/registry';
import { createNotifications, type NotificationInput } from './notifications.service';
import { checkPushReceipts, pushNotification } from './push.service';

/**
 * NOT-01: the reminders due at `now` (08:00 Douala: 3 days before the deadline, the day before,
 * the day itself, and the day after with the fine notice). Each source must be idempotent per
 * obligation and day, since the job runs hourly.
 */
export type ReminderSource = (now: Date) => Promise<NotificationInput[]>;

const reminderSources: ReminderSource[] = [];

export function registerReminderSource(source: ReminderSource): void {
  reminderSources.push(source);
}

export async function sendDueReminders(now: Date = clock.now()): Promise<number> {
  let sent = 0;
  for (const source of reminderSources) {
    const reminders = await source(now);
    const effects = new AfterCommit();
    await createNotifications(reminders, effects);
    await effects.run();
    sent += reminders.length;
  }
  return sent;
}

export function registerNotificationJobs(): void {
  registerJob({
    name: 'notifications.push',
    concurrency: 5,
    process: (job: Job<{ notificationId: string }>) => pushNotification(job.data.notificationId),
  });
  registerJob({ name: 'notifications.receipts', process: () => checkPushReceipts() });
  registerRepeatable({
    id: 'notifications.receipts.every15',
    name: 'notifications.receipts',
    pattern: '*/15 * * * *',
  });
  registerJob({ name: 'reminders.send', process: () => sendDueReminders() });
  registerRepeatable({ id: 'reminders.hourly', name: 'reminders.send', pattern: '0 * * * *' });
}
