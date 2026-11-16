// Statements and the audit export (spec 2.14, 2.7 Me and Verification, FSD STA-01, LED-04).
import { z } from 'zod';
import { languageSchema, instantSchema, uuidSchema } from './common';

const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'INVALID_DATE');

/** A month, a cycle or custom dates, always in Africa/Douala days (2.14). */
export const statementPeriodRequestSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('MONTH'),
    year: z.number().int().min(2020).max(2100),
    month: z.number().int().min(1).max(12),
  }),
  /** The cycle's whole run; the current cycle when `number` is left out. */
  z.strictObject({ kind: z.literal('CYCLE'), number: z.number().int().positive().optional() }),
  /** Both days included. */
  z.strictObject({ kind: z.literal('CUSTOM'), from: dayString, to: dayString }),
]);
export type StatementPeriodRequest = z.infer<typeof statementPeriodRequestSchema>;

/** POST /me/statements: the member's own statement in one group, in their language unless told. */
export const createStatementRequestSchema = z.strictObject({
  groupId: uuidSchema,
  period: statementPeriodRequestSchema,
  language: languageSchema.optional(),
});
export type CreateStatementRequest = z.infer<typeof createStatementRequestSchema>;

export const statementSchema = z.strictObject({
  id: uuidSchema,
  groupId: uuidSchema,
  groupName: z.string(),
  /** `start` included, `end` excluded (UTC instants of Douala midnights). */
  period: z.strictObject({ start: instantSchema, end: instantSchema }),
  language: languageSchema,
  issuedAt: instantSchema,
  /** 12 hex characters, printed on the PDF. */
  verificationCode: z.string(),
  /** Where anyone can check it, without "https://" (D9). */
  verifyAddress: z.string(),
});
export type StatementDto = z.infer<typeof statementSchema>;

export const statementResponseSchema = z.strictObject({ statement: statementSchema });

/** GET /me/statements?groupId=. */
export const statementListQuerySchema = z.strictObject({ groupId: uuidSchema.optional() });
export const statementListSchema = z.strictObject({ statements: z.array(statementSchema) });

/** GET /me/statements/:id: the statement and a signed URL of its PDF, valid 5 minutes. */
export const statementDownloadSchema = z.strictObject({
  statement: statementSchema,
  url: z.string(),
  expiresAt: instantSchema,
});

/**
 * GET /verify/:code, unauthenticated (2.14): the minimum a bank needs. Never a name, a number or
 * anything about other members.
 */
export const verifyResultSchema = z.union([
  z.strictObject({
    genuine: z.literal(true),
    period: z.strictObject({ start: instantSchema, end: instantSchema }),
    issuedAt: instantSchema,
  }),
  z.strictObject({ genuine: z.literal(false) }),
]);
export type VerifyResult = z.infer<typeof verifyResultSchema>;

/** GET /groups/:id/ledger/export?format=json|csv. */
export const auditExportQuerySchema = z.strictObject({
  format: z.enum(['json', 'csv']).optional(),
});
