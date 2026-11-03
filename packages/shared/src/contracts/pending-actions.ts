// Pending actions (spec 4.5): every action that moves money or changes the group is prepared by
// the server as a card, then confirmed by the member in the app. The app draws the
// ConfirmationCard from `preview`, never from the agent's text.
import { z } from 'zod';
import { bilingualSchema, fcfaSchema, instantSchema, pinSchema, uuidSchema } from './common';

export const actionLevelSchema = z.enum(['L1', 'L2']);
export const actionOriginSchema = z.enum(['AGENT', 'UI']);
export const pendingActionStatusSchema = z.enum([
  'PENDING',
  'CONFIRMED',
  'CANCELLED',
  'EXPIRED',
  'DONE',
  'FAILED',
]);
export type PendingActionStatus = z.infer<typeof pendingActionStatusSchema>;

/** One line of the card: label on the left, integer FCFA amount on the right. */
export const previewLineSchema = z.strictObject({ label: bilingualSchema, amount: fcfaSchema });

export const actionPreviewSchema = z.strictObject({
  /** Verb plus object: "Payer ta cotisation". */
  title: bilingualSchema,
  lines: z.array(previewLineSchema),
  /** Bold total line; null when the action moves no money. */
  total: fcfaSchema.nullable(),
  notes: z.array(bilingualSchema),
  /** Repeats the verb and amount: "Payer 11 000 FCFA". */
  confirmLabel: bilingualSchema,
});
export type ActionPreview = z.infer<typeof actionPreviewSchema>;

export const pendingActionSchema = z.strictObject({
  id: uuidSchema,
  type: z.string(),
  level: actionLevelSchema,
  status: pendingActionStatusSchema,
  origin: actionOriginSchema,
  groupId: uuidSchema.nullable(),
  preview: actionPreviewSchema,
  /** L2 actions ask for the member's PIN after the tap (R13.2). */
  requiresPin: z.boolean(),
  expiresAt: instantSchema,
  createdAt: instantSchema,
  result: z.strictObject({ ref: z.string().nullable(), summary: bilingualSchema.nullable() }).nullable(),
  /** `key` names the designer's card: confirmation.failed.<key> (`generic` when none fits). */
  failure: z
    .strictObject({ code: z.string(), key: z.string(), messageFr: z.string(), messageEn: z.string() })
    .nullable(),
});
export type PendingActionDto = z.infer<typeof pendingActionSchema>;

export const pendingActionResponseSchema = z.strictObject({ action: pendingActionSchema });

export const confirmActionRequestSchema = z.strictObject({ pin: pinSchema.optional() });
export type ConfirmActionRequest = z.infer<typeof confirmActionRequestSchema>;

/** `data` is the action's one-time result (an invite link, ...), never stored by the server. */
export const confirmActionResponseSchema = z.strictObject({
  action: pendingActionSchema,
  data: z.record(z.string(), z.unknown()).nullable(),
});

/** What creating an action returns to a screen or to an agent tool. */
export const pendingActionCreatedSchema = z.strictObject({ action: pendingActionSchema });
