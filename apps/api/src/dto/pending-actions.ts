// PendingAction mapper. `args` (normalised handler input) never leaves the server: the card is
// drawn from the server-built preview only (spec 4.5).
import { actionPreviewSchema, type PendingActionDto } from '@njangi/shared/contracts/pending-actions';
import type { PendingActionUpdatedPayload } from '@njangi/shared/contracts/realtime';
import { bilingualSchema } from '@njangi/shared/contracts/common';
import type { PendingAction } from '../lib/prisma';
import { failureKeyOf } from './failure-keys';
import { iso } from './time';

function parseBilingual(value: unknown) {
  const parsed = bilingualSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function resultOf(action: PendingAction): PendingActionDto['result'] {
  if (action.status !== 'DONE' && action.status !== 'CONFIRMED') return null;
  if (!action.resultRef && !action.resultSummary) return null;
  return { ref: action.resultRef, summary: parseBilingual(action.resultSummary) };
}

function failureOf(action: PendingAction): PendingActionDto['failure'] {
  if (!action.failureCode) return null;
  const text = parseBilingual(action.failureText);
  return { code: action.failureCode, key: failureKeyOf(action.failureCode), messageFr: text?.fr ?? '', messageEn: text?.en ?? '' };
}

export function toPendingAction(action: PendingAction): PendingActionDto {
  return {
    id: action.id,
    type: action.type,
    level: action.level,
    status: action.status,
    origin: action.origin,
    groupId: action.groupId,
    preview: actionPreviewSchema.parse(action.preview),
    requiresPin: action.level === 'L2',
    expiresAt: iso(action.expiresAt),
    createdAt: iso(action.createdAt),
    result: resultOf(action),
    failure: failureOf(action),
  };
}

export function toPendingActionUpdate(action: PendingAction): PendingActionUpdatedPayload {
  return { id: action.id, status: action.status, result: resultOf(action), failure: failureOf(action) };
}
