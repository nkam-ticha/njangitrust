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
}

export async function audit(entry: AuditEntry, db: Db = getPrisma()): Promise<void> {
  const context = currentContext();
  await db.auditLog.create({
    data: {
      action: entry.action,
      actorUserId: entry.actorUserId ?? context?.userId ?? null,
      groupId: entry.groupId ?? null,
      target: entry.target ?? null,
      details: redact(entry.details ?? {}) as Prisma.InputJsonValue,
      deviceId: context?.deviceId ?? null,
      requestId: context?.requestId ?? null,
    },
  });
}
