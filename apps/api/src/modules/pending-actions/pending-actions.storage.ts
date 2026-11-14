// How args and previews are stored. Ordinary actions keep plain JSON; confidential ones keep
// AES-GCM sealed values while pending and a neutral, redacted form once finished (R11.5).
import type { ActionPreview } from '@njangi/shared/contracts/pending-actions';
import { openJson, sealJson } from '../../lib/crypto';
import { Prisma, type PendingAction } from '../../lib/prisma';
import type { ActionHandler } from './pending-actions.types';
import { getActionHandler } from './registry';

interface Sealed {
  sealed: string;
}

function isSealed(value: unknown): value is Sealed {
  return (
    typeof value === 'object' && value !== null && typeof (value as Sealed).sealed === 'string'
  );
}

export function isConfidential(handler: ActionHandler, args: unknown): boolean {
  return handler.confidential?.(args) ?? false;
}

/** The column values to store for a new action. */
export function storedFields(handler: ActionHandler, args: unknown, preview: ActionPreview) {
  if (!isConfidential(handler, args)) {
    return { args: args as Prisma.InputJsonValue, preview: preview as Prisma.InputJsonValue };
  }
  return { args: { sealed: sealJson(args) }, preview: { sealed: sealJson(preview) } };
}

/** A row with its args and preview readable (sealed values opened). Never stored back. */
export function openAction(row: PendingAction): PendingAction {
  return {
    ...row,
    args: (isSealed(row.args) ? openJson(row.args.sealed) : row.args) as Prisma.JsonValue,
    preview: (isSealed(row.preview)
      ? openJson(row.preview.sealed)
      : row.preview) as Prisma.JsonValue,
  };
}

const HOUR_MS = 3_600_000;
const toHour = (at: Date) => new Date(Math.floor(at.getTime() / HOUR_MS) * HOUR_MS);

/** A row's times once it leaves PENDING (the new confirmedAt/completedAt where they change). */
export interface ActionTimes {
  createdAt: Date;
  expiresAt: Date;
  confirmedAt: Date | null;
  completedAt: Date | null;
}

/**
 * The update that removes a confidential action's secret once it leaves PENDING, or an empty
 * object for ordinary actions. Pass the opened args. Spread it last in the update.
 */
export function redactionFor(
  type: string,
  openedArgs: unknown,
  times: ActionTimes,
): {
  args?: Prisma.InputJsonValue;
  preview?: Prisma.InputJsonValue;
  resultSummary?: typeof Prisma.DbNull;
  resultRef?: null;
  createdAt?: Date;
  expiresAt?: Date;
  confirmedAt?: Date | null;
  completedAt?: Date | null;
} {
  const handler = getActionHandler(type);
  if (!handler || !isConfidential(handler, openedArgs)) return {};
  if (!handler.redacted) throw new Error(`Confidential action ${type} must define redacted()`);
  const redacted = handler.redacted(openedArgs);
  return {
    args: redacted.args as Prisma.InputJsonValue,
    preview: redacted.preview,
    // L1: no result text either; the finished card shows its neutral redacted form only.
    resultSummary: Prisma.DbNull,
    // H1: no record id (a vote receipt) and no instant finer than the hour, so a finished card
    // cannot be matched to a change in a proposal's counters or to a job.
    resultRef: null,
    createdAt: toHour(times.createdAt),
    expiresAt: toHour(times.expiresAt),
    confirmedAt: times.confirmedAt ? toHour(times.confirmedAt) : null,
    completedAt: times.completedAt ? toHour(times.completedAt) : null,
  };
}

/** Redaction for a stored row (sealed or not), with the times that change in this update. */
export function redactionForRow(
  row: PendingAction,
  changes: { confirmedAt?: Date; completedAt?: Date },
) {
  return redactionFor(row.type, openAction(row).args, {
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    confirmedAt: changes.confirmedAt ?? row.confirmedAt,
    completedAt: changes.completedAt ?? row.completedAt,
  });
}
