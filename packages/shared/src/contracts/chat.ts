// Group chat (spec 1.5, 2.7 Chat). Phase 0 emits system events; Phase 7 adds member messages,
// media, replies and mentions to the same DTO.
import { z } from 'zod';
import { bilingualSchema, instantSchema, uuidSchema } from './common';

export const messageKindSchema = z.enum([
  'TEXT',
  'IMAGE',
  'VIDEO',
  'DOCUMENT',
  'VOICE',
  'SYSTEM',
  'AGENT',
]);

export const messageSchema = z.strictObject({
  id: uuidSchema,
  groupId: uuidSchema,
  kind: messageKindSchema,
  /** A member's or the agent's text. Null for SYSTEM messages and deleted messages. */
  text: z.string().nullable(),
  /** SYSTEM events in both languages ("Carine a mis à jour son numéro de paiement."). */
  systemText: bilingualSchema.nullable(),
  author: z.strictObject({ membershipId: uuidSchema, name: z.string() }).nullable(),
  createdAt: instantSchema,
});
export type MessageDto = z.infer<typeof messageSchema>;
