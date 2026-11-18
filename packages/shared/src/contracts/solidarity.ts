// Solidarity requests (spec R10, FSD SOL-01): a request opens a SOLIDARITY_PAYOUT vote (majority,
// solidarityVoteWindowHours); if it passes, the money goes to the recipient's own number.
import { z } from 'zod';
import { instantSchema, textSchema, uuidSchema } from './common';

export const solidarityEventSchema = z.enum(['DEUIL', 'NAISSANCE', 'MALADIE', 'MARIAGE', 'AUTRE']);

export const solidarityRequestSchema = z.strictObject({
  /** The member supported; the requester themself or another member (R10.2). */
  recipientMembershipId: uuidSchema,
  event: solidarityEventSchema,
  amount: z.number().int().positive(),
  /** Optional, visible only to the group. */
  note: textSchema(300).optional(),
});
export type SolidarityRequestInput = z.infer<typeof solidarityRequestSchema>;

export const solidarityRequestItemSchema = z.strictObject({
  id: uuidSchema,
  proposalId: uuidSchema.nullable(),
  recipient: z.strictObject({ membershipId: uuidSchema, name: z.string() }),
  requester: z.strictObject({ membershipId: uuidSchema, name: z.string() }),
  event: solidarityEventSchema,
  amount: z.number().int(),
  note: z.string().nullable(),
  status: z.enum(['VOTING', 'APPROVED', 'REJECTED', 'PAID', 'REFUNDED', 'FAILED']),
  createdAt: instantSchema,
});
export type SolidarityRequestItem = z.infer<typeof solidarityRequestItemSchema>;

export const solidarityRequestListSchema = z.strictObject({
  /** The fund's balance, from the ledger; null until the money modules report it. */
  fundBalance: z.number().int().nullable(),
  requests: z.array(solidarityRequestItemSchema),
});
