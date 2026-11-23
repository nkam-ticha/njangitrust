// Retention (D33): whatever members sent into the app is deleted three months after it was sent,
// to free storage and the database. That is chat messages with their photos, videos, documents
// and voice notes, the private and group conversations with the agent (and the summaries written
// from them), the notices that carried a piece of them, and the upload slots that went with them.
// The ledger, votes, rule sets, statements and minutes are records of the group and are never
// touched (CLAUDE.md rule 3, spec 2.5).
import { clock } from '../../lib/clock';
import { componentLogger } from '../../lib/logger';
import { getPrisma } from '../../lib/prisma';
import { getStorage } from '../../storage';
import { audit } from '../audit';

const log = componentLogger('retention');

/** D33: how long a message, a file or an agent exchange lives. */
export const RETENTION_DAYS = 90;
const DAY_MS = 86_400_000;
const BATCH = 100;
/** One run stays well inside a serverless function's 60 s; the next run continues. */
const RUN_BUDGET_MS = 35_000;
/** A storage call that does not answer in this time counts as failed (the next run retries). */
const FILE_TIMEOUT_MS = 8_000;

export function retentionCutoff(now: Date = clock.now()): Date {
  return new Date(now.getTime() - RETENTION_DAYS * DAY_MS);
}

export interface PurgeResult {
  /** Chat messages deleted. */
  messages: number;
  /** Attachments deleted (their stored files are removed first). */
  attachments: number;
  /** Stored files removed from the bucket. */
  files: number;
  /** Files that could not be removed; their attachment stays and the next run tries again. */
  failedFiles: number;
  agentMessages: number;
  /** Conversation summaries cleared because they were written from deleted exchanges. */
  summaries: number;
  uploadTickets: number;
  /** In-app notices older than the cut-off (some carried the first words of a message). */
  notifications: number;
  /** Finished background-job rows older than the cut-off (ids only). */
  jobs: number;
  /** True when the time budget ended the run before everything old was gone. */
  more: boolean;
}

function withTimeout<T>(work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('storage timeout')), FILE_TIMEOUT_MS);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('storage error'));
      },
    );
  });
}

/**
 * Removes stored objects; returns the keys that are gone. An object that is not there counts as
 * gone, even when the driver answered a removal with an error. Stops when the run's time is up.
 */
async function removeFiles(
  keys: string[],
  outOfTime: () => boolean,
): Promise<{ gone: Set<string>; failed: number }> {
  const storage = getStorage();
  const gone = new Set<string>();
  let failed = 0;
  for (const key of keys) {
    if (outOfTime()) {
      failed += 1;
      continue;
    }
    try {
      await withTimeout(storage.remove(key));
      gone.add(key);
    } catch (error) {
      const missing = await withTimeout(storage.stat(key)).then(
        (found) => found === null,
        () => false,
      );
      if (missing) gone.add(key);
      else {
        failed += 1;
        log.warn({ err: error }, 'could not remove an expired file');
      }
    }
  }
  return { gone, failed };
}

/**
 * Deletes everything sent more than `RETENTION_DAYS` ago. Safe to run again and again: each run
 * takes what is old now, in small batches, and reports counts only (no content, no names).
 */
export async function purgeExpiredContent(now: Date = clock.now()): Promise<PurgeResult> {
  const db = getPrisma();
  const cutoff = retentionCutoff(now);
  const deadline = clock.nowMs() + RUN_BUDGET_MS;
  const outOfTime = (): boolean => clock.nowMs() >= deadline;
  const result: PurgeResult = {
    messages: 0,
    attachments: 0,
    files: 0,
    failedFiles: 0,
    agentMessages: 0,
    summaries: 0,
    uploadTickets: 0,
    notifications: 0,
    jobs: 0,
    more: false,
  };

  // 1. Files first, so a deleted row never leaves an object behind in the bucket. A file that
  // cannot be removed keeps its row and is skipped, so the files behind it still get their turn.
  const stuckAttachments: string[] = [];
  while (!outOfTime()) {
    const old = await db.attachment.findMany({
      where: { createdAt: { lt: cutoff }, id: { notIn: stuckAttachments } },
      select: { id: true, storageKey: true, thumbnailKey: true },
      orderBy: { createdAt: 'asc' },
      take: BATCH,
    });
    if (old.length === 0) break;
    const keys = old.flatMap((a) => [a.storageKey, ...(a.thumbnailKey ? [a.thumbnailKey] : [])]);
    const { gone, failed } = await removeFiles(keys, outOfTime);
    result.files += gone.size;
    result.failedFiles += failed;
    const deletable = old.filter(
      (a) => gone.has(a.storageKey) && (!a.thumbnailKey || gone.has(a.thumbnailKey)),
    );
    for (const a of old) if (!deletable.includes(a)) stuckAttachments.push(a.id);
    if (deletable.length > 0) {
      const removed = await db.attachment.deleteMany({
        where: { id: { in: deletable.map((a) => a.id) } },
      });
      result.attachments += removed.count;
    }
  }
  if (stuckAttachments.length > 0) result.more = true;

  // 2. Messages. One whose file could not be removed waits with it, so the text never disappears
  // while its file can still be fetched; replies lose the link, nothing else refers to a message.
  while (!outOfTime()) {
    const old = await db.message.findMany({
      where: { createdAt: { lt: cutoff }, attachmentId: null },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: BATCH,
    });
    if (old.length === 0) break;
    const removed = await db.message.deleteMany({ where: { id: { in: old.map((m) => m.id) } } });
    result.messages += removed.count;
  }

  // 3. The agent conversations, then the summaries written from them: a summary of a conversation
  // that lost exchanges may repeat what was in them, so it is cleared and rebuilt from what is left.
  const touched = new Set<string>();
  while (!outOfTime()) {
    const old = await db.agentMessage.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true, conversationId: true },
      orderBy: { createdAt: 'asc' },
      take: BATCH,
    });
    if (old.length === 0) break;
    const removed = await db.agentMessage.deleteMany({
      where: { id: { in: old.map((m) => m.id) } },
    });
    result.agentMessages += removed.count;
    for (const m of old) touched.add(m.conversationId);
  }
  if (touched.size > 0) {
    const cleared = await db.agentConversation.updateMany({
      where: { id: { in: [...touched] }, rollingSummary: { not: null } },
      data: { rollingSummary: null },
    });
    result.summaries += cleared.count;
  }
  const dormant = await db.agentConversation.updateMany({
    where: { rollingSummary: { not: null }, updatedAt: { lt: cutoff }, messages: { none: {} } },
    data: { rollingSummary: null },
  });
  result.summaries += dormant.count;

  // 4. Upload slots: an upload that never completed may have left a file in the bucket.
  const stuckTickets: string[] = [];
  while (!outOfTime()) {
    const old = await db.uploadTicket.findMany({
      where: { createdAt: { lt: cutoff }, id: { notIn: stuckTickets } },
      select: { id: true, storageKey: true, thumbnailKey: true, completedAt: true },
      orderBy: { createdAt: 'asc' },
      take: BATCH,
    });
    if (old.length === 0) break;
    const unfinished = old.filter((t) => !t.completedAt);
    const keys = unfinished.flatMap((t) => [
      t.storageKey,
      ...(t.thumbnailKey ? [t.thumbnailKey] : []),
    ]);
    const { gone, failed } = await removeFiles(keys, outOfTime);
    result.files += gone.size;
    result.failedFiles += failed;
    const deletable = old.filter(
      (t) =>
        t.completedAt || (gone.has(t.storageKey) && (!t.thumbnailKey || gone.has(t.thumbnailKey))),
    );
    for (const t of old) if (!deletable.includes(t)) stuckTickets.push(t.id);
    if (deletable.length > 0) {
      const removed = await db.uploadTicket.deleteMany({
        where: { id: { in: deletable.map((t) => t.id) } },
      });
      result.uploadTickets += removed.count;
    }
  }
  if (stuckTickets.length > 0) result.more = true;

  // 5. In-app notices (an announcement's notice carries its first words); push tickets go with them.
  while (!outOfTime()) {
    const old = await db.notification.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: BATCH,
    });
    if (old.length === 0) break;
    const removed = await db.notification.deleteMany({
      where: { id: { in: old.map((n) => n.id) } },
    });
    result.notifications += removed.count;
  }

  // 6. Rows of finished background jobs (ids only, but they pile up). Waiting jobs are never touched.
  while (!outOfTime()) {
    const old = await db.deploymentJob.findMany({
      where: { status: { in: ['SUCCEEDED', 'DEAD'] }, updatedAt: { lt: cutoff } },
      select: { id: true },
      take: BATCH,
    });
    if (old.length === 0) break;
    const removed = await db.deploymentJob.deleteMany({
      where: { id: { in: old.map((j) => j.id) } },
    });
    result.jobs += removed.count;
  }

  if (outOfTime()) result.more = true;
  const total =
    result.messages +
    result.attachments +
    result.agentMessages +
    result.uploadTickets +
    result.notifications +
    result.jobs;
  if (total > 0 || result.failedFiles > 0) {
    await audit({
      action: 'retention.purge',
      system: true,
      details: { cutoff: cutoff.toISOString(), ...result },
    });
  }
  return result;
}
