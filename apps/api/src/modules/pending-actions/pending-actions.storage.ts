// How args and previews are stored. Ordinary actions keep plain JSON; confidential ones keep
// AES-GCM sealed values while pending and a neutral, redacted form once finished (R11.5).
import type { ActionPreview } from '@njangi/shared/contracts/pending-actions';
import { openJson, sealJson } from '../../lib/crypto';
import type { PendingAction, Prisma } from '../../lib/prisma';
import type { ActionHandler } from './pending-actions.types';
import { getActionHandler } from './registry';

interface Sealed {
  sealed: string;
}

function isSealed(value: unknown): value is Sealed {
  return typeof value === 'object' && value !== null && typeof (value as Sealed).sealed === 'string';
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
    preview: (isSealed(row.preview) ? openJson(row.preview.sealed) : row.preview) as Prisma.JsonValue,
  };
}

/**
 * The update that removes a confidential action's secret once it leaves PENDING, or an empty
 * object for ordinary actions. Pass the opened args.
 */
export function redactionFor(type: string, openedArgs: unknown): { args?: Prisma.InputJsonValue; preview?: Prisma.InputJsonValue } {
  const handler = getActionHandler(type);
  if (!handler || !isConfidential(handler, openedArgs)) return {};
  if (!handler.redacted) throw new Error(`Confidential action ${type} must define redacted()`);
  const redacted = handler.redacted(openedArgs);
  return { args: redacted.args as Prisma.InputJsonValue, preview: redacted.preview as Prisma.InputJsonValue };
}

/** Redaction for a stored row (sealed or not). */
export function redactionForRow(row: PendingAction) {
  return redactionFor(row.type, openAction(row).args);
}
