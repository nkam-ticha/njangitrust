// Export of my personal data (spec Part 7, FSD PRV-03, D34): one JSON document with the member's own
// data and nothing else. Every schema is strict, so a field that is not listed here can never travel:
// no other member's name or number, no PIN or hash, no token, no secret choice, no ledger hash.
import { z } from 'zod';
import { instantSchema, languageSchema, uuidSchema } from './common';
import {
  membershipRoleSchema,
  membershipStatusSchema,
  operatorSchema,
  reliabilitySchema,
} from './me';
import { notificationPrefsSchema } from './notifications';

const fcfa = z.number().int();

export const dataExportProfileSchema = z.strictObject({
  id: uuidSchema,
  name: z.string(),
  /** My own login number, E.164. */
  phone: z.string(),
  language: languageSchema,
  createdAt: instantSchema,
  consentVersion: z.string(),
  consentAt: instantSchema,
});

/** My own payment numbers, current and past (R13.6: the history is visible to the member only). */
export const dataExportPaymentNumberSchema = z.strictObject({
  number: z.string(),
  operator: operatorSchema,
  activeFrom: instantSchema,
  activeTo: instantSchema.nullable(),
});

export const dataExportGroupSchema = z.strictObject({
  groupId: uuidSchema,
  name: z.string(),
  role: membershipRoleSchema,
  membershipStatus: membershipStatusSchema,
  joinedAt: instantSchema,
  leftAt: instantSchema.nullable(),
  /** The reliability score (R14) in this group. */
  reliability: reliabilitySchema,
});

export const dataExportObligationSchema = z.strictObject({
  groupId: uuidSchema,
  kind: z.enum([
    'CONTRIBUTION',
    'SOLIDARITY',
    'FINE',
    'LOAN_INSTALLMENT',
    'BID',
    'SHORTFALL_SHARE',
    'CORRECTION',
  ]),
  roundNumber: z.number().int().nullable(),
  amount: fcfa,
  dueAt: instantSchema,
  status: z.enum(['DUE', 'PAID', 'SETTLED', 'CANCELLED']),
  paidAt: instantSchema.nullable(),
  onTime: z.boolean().nullable(),
});

export const dataExportPaymentSchema = z.strictObject({
  groupId: uuidSchema,
  amount: fcfa,
  fee: fcfa.nullable(),
  status: z.enum(['CREATED', 'PENDING', 'SUCCESSFUL', 'FAILED', 'EXPIRED']),
  createdAt: instantSchema,
  settledAt: instantSchema.nullable(),
});

/** Money sent to me: withdrawals, loan disbursements and solidarity payouts. */
export const dataExportWithdrawalSchema = z.strictObject({
  groupId: uuidSchema,
  purpose: z.enum(['WITHDRAWAL', 'LOAN', 'SOLIDARITY']),
  amount: fcfa,
  fee: fcfa.nullable(),
  status: z.enum(['CREATED', 'PENDING', 'SUCCESSFUL', 'REFUNDED', 'FAILED', 'EXPIRED']),
  createdAt: instantSchema,
  settledAt: instantSchema.nullable(),
});

export const dataExportLoanSchema = z.strictObject({
  groupId: uuidSchema,
  principal: fcfa,
  months: z.number().int(),
  ratePermille: z.number().int(),
  interest: fcfa,
  totalDue: fcfa,
  status: z.enum([
    'REQUESTED',
    'APPROVED',
    'REJECTED',
    'DISBURSED',
    'REPAID',
    'OVERDUE',
    'EXPIRED',
    'REFUNDED',
  ]),
  createdAt: instantSchema,
});

export const dataExportBidSchema = z.strictObject({
  groupId: uuidSchema,
  roundNumber: z.number().int(),
  amount: fcfa,
  placedAt: instantSchema,
});

/**
 * A vote I cast. A secret vote says only that I voted (R11.5): its `choice` is always null and its
 * time is rounded down to the hour, as everywhere else (D32).
 */
export const dataExportVoteSchema = z.strictObject({
  groupId: uuidSchema,
  proposalType: z.string(),
  secret: z.boolean(),
  choice: z.enum(['YES', 'NO']).nullable(),
  votedAt: instantSchema,
});

/** My own entries of the group's ledger: the entries about me, and only the postings on my accounts. */
export const dataExportLedgerEntrySchema = z.strictObject({
  groupId: uuidSchema,
  seq: z.number().int(),
  type: z.string(),
  occurredAt: instantSchema,
  postings: z.array(
    z.strictObject({
      account: z.enum(['PAYABLE', 'RECEIVABLE']),
      /** Debit positive, credit negative (spec 2.5). */
      amount: fcfa,
    }),
  ),
});

export const dataExportChatMessageSchema = z.strictObject({
  groupId: uuidSchema,
  kind: z.string(),
  text: z.string().nullable(),
  createdAt: instantSchema,
});

/** My private conversation with the assistant, as stored (numbers already replaced by markers). */
export const dataExportConversationSchema = z.strictObject({
  groupId: uuidSchema.nullable(),
  messages: z.array(
    z.strictObject({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
      createdAt: instantSchema,
    }),
  ),
});

export const dataExportDeviceSchema = z.strictObject({
  id: uuidSchema,
  platform: z.enum(['ANDROID', 'IOS', 'WEB']),
  pushEnabled: z.boolean(),
  lastSeenAt: instantSchema,
});

export const dataExportStatementSchema = z.strictObject({
  id: uuidSchema,
  groupId: uuidSchema,
  periodStart: instantSchema,
  periodEnd: instantSchema,
  language: languageSchema,
  issuedAt: instantSchema,
  verificationCode: z.string(),
});

export const dataExportSchema = z.strictObject({
  format: z.literal('njangitrust-personal-data'),
  version: z.literal(1),
  generatedAt: instantSchema,
  profile: dataExportProfileSchema,
  paymentNumbers: z.array(dataExportPaymentNumberSchema),
  groups: z.array(dataExportGroupSchema),
  obligations: z.array(dataExportObligationSchema),
  payments: z.array(dataExportPaymentSchema),
  withdrawals: z.array(dataExportWithdrawalSchema),
  loans: z.array(dataExportLoanSchema),
  bids: z.array(dataExportBidSchema),
  votes: z.array(dataExportVoteSchema),
  ledgerEntries: z.array(dataExportLedgerEntrySchema),
  chatMessages: z.array(dataExportChatMessageSchema),
  assistantConversations: z.array(dataExportConversationSchema),
  notificationSettings: notificationPrefsSchema,
  devices: z.array(dataExportDeviceSchema),
  statements: z.array(dataExportStatementSchema),
});
export type DataExport = z.infer<typeof dataExportSchema>;

/** GET /v1/me/data-export. */
export const dataExportResponseSchema = z.strictObject({ export: dataExportSchema });
