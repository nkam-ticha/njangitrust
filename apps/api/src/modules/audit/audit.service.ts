// Audit log helper (spec 2.4, 2.10, R1.2). Pass the transaction client when the audited change
// happens inside one, so the change and its audit entry commit together. Details are redacted.
import { getPrisma, type Db, type Prisma } from '../../lib/prisma';
import { currentContext } from '../../lib/request-context';
import { redact } from '../../lib/redact';

export interface AuditEntry {
  /** Stable dotted name: `auth.login.locked`, `invite.created`, `pin.reset.completed`, ... */
  action: string;
  actorUserId?: string | null;
  groupId?: string | null;
  /** `<Model>:<id>` of the affected record. */
  target?: string | null;
  /** Non-personal facts (counts, statuses, codes). Redacted anyway. */
  details?: Record<string, unknown>;
  /**
   * A system decision (a vote closing, a job): never attributed to the request it happens to run
   * in, so a secret vote that closes a proposal cannot be traced to its voter (privacy-guard H1).
   */
  system?: boolean;
}

export async function audit(entry: AuditEntry, db: Db = getPrisma()): Promise<void> {
  const context = entry.system ? undefined : currentContext();
  await db.auditLog.create({
    data: {
      action: entry.action,
      actorUserId: entry.system ? null : (entry.actorUserId ?? context?.userId ?? null),
      groupId: entry.groupId ?? null,
      target: entry.target ?? null,
      details: redact(entry.details ?? {}) as Prisma.InputJsonValue,
      deviceId: context?.deviceId ?? null,
      requestId: context?.requestId ?? null,
    },
  });
}
