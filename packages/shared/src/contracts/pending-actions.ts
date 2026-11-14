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
  /** Label of the total line ("Pris sur ton solde", copy key confirmation.lines.fromBalance); null or absent: "Total". */
  totalLabel: bilingualSchema.nullable().optional(),
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
  result: z
    .strictObject({ ref: z.string().nullable(), summary: bilingualSchema.nullable() })
    .nullable(),
  /** `key` names the designer's card: confirmation.failed.<key> (`generic` when none fits). */
  failure: z
    .strictObject({
      code: z.string(),
      key: z.string(),
      messageFr: z.string(),
      messageEn: z.string(),
    })
    .nullable(),
});
export type PendingActionDto = z.infer<typeof pendingActionSchema>;

export const pendingActionResponseSchema = z.strictObject({ action: pendingActionSchema });

export const confirmActionRequestSchema = z.strictObject({ pin: pinSchema.optional() });
export type ConfirmActionRequest = z.infer<typeof confirmActionRequestSchema>;

/** `data` is the action's one-time result (an invite link, ...), never stored by the server. */
/**
 * One-time result data of a confirmed action, by action type. Each shape is an allowlist built by
 * the API's mapper (privacy-guard M4); a type without one returns null.
 */
export const actionResultDataSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('INVITE_CREATE'),
    inviteId: uuidSchema,
    /** The one-time link to share; returned once, never stored. */
    link: z.string(),
    expiresAt: instantSchema,
  }),
  z.strictObject({
    type: z.literal('PIN_RESET_APPROVE'),
    approved: z.boolean(),
    link: z.string().optional(),
    /** D14: the link works only from this time (24 hours after approval)… */
    linkUsableFrom: instantSchema.optional(),
    /** …and for 30 minutes after that. */
    linkExpiresAt: instantSchema.optional(),
  }),
]);
export type ActionResultData = z.infer<typeof actionResultDataSchema>;

export const confirmActionResponseSchema = z.strictObject({
  action: pendingActionSchema,
  data: actionResultDataSchema.nullable(),
});

/** What creating an action returns to a screen or to an agent tool. */
export const pendingActionCreatedSchema = z.strictObject({ action: pendingActionSchema });
