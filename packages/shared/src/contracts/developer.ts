// The developer console (D28). The only API audience that receives full phone numbers: they appear
// here and nowhere else. Requests are strict; responses are plain allowlisted shapes.
import { z } from 'zod';
import { instantSchema, uuidSchema, type languageSchema } from './common';
import type { groupStatusSchema, membershipRoleSchema, membershipStatusSchema } from './me';

export const developerLoginRequestSchema = z.strictObject({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});
export type DeveloperLoginRequest = z.infer<typeof developerLoginRequestSchema>;

export const developerSessionSchema = z.strictObject({
  token: z.string(),
  expiresAt: instantSchema,
});
export type DeveloperSession = z.infer<typeof developerSessionSchema>;

const pageSchema = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
};

export const developerUsersQuerySchema = z.strictObject({
  /** A name, or a phone number in any spelling. */
  q: z.string().trim().max(64).optional(),
  status: z.enum(['all', 'active', 'deleted']).default('all'),
  ...pageSchema,
});
export type DeveloperUsersQuery = z.infer<typeof developerUsersQuerySchema>;

export const developerGroupsQuerySchema = z.strictObject({
  q: z.string().trim().max(64).optional(),
  status: z.enum(['all', 'FORMING', 'ACTIVE', 'CLOSED']).default('all'),
  ...pageSchema,
});
export type DeveloperGroupsQuery = z.infer<typeof developerGroupsQuerySchema>;

export const developerIdParamsSchema = z.strictObject({ id: uuidSchema });

export const developerUserStatusSchema = z.enum(['ACTIVE', 'DELETED']);

export interface DeveloperPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DeveloperUserRow {
  id: string;
  name: string;
  /** E.164, in full. Null once the account is deleted (the number is erased by then). */
  phone: string | null;
  language: z.infer<typeof languageSchema>;
  status: z.infer<typeof developerUserStatusSchema>;
  createdAt: string;
  /** The latest time the person logged in (a new session, not a token renewal). */
  lastLoginAt: string | null;
  groupCount: number;
}

export interface DeveloperPaymentNumber {
  number: string;
  operator: 'MTN' | 'ORANGE' | 'UNKNOWN';
  activeFrom: string;
  activeTo: string | null;
}

export interface DeveloperDevice {
  id: string;
  platform: 'ANDROID' | 'IOS' | 'WEB';
  createdAt: string;
  lastSeenAt: string;
  revoked: boolean;
  hasPushToken: boolean;
}

export interface DeveloperLogin {
  sessionId: string;
  client: 'MOBILE' | 'WEB';
  loggedInAt: string;
  lastActiveAt: string;
  /** Still able to renew: not logged out, not expired. */
  open: boolean;
}

export interface DeveloperMembership {
  groupId: string;
  groupName: string;
  groupStatus: z.infer<typeof groupStatusSchema>;
  groupHidden: boolean;
  role: z.infer<typeof membershipRoleSchema>;
  status: z.infer<typeof membershipStatusSchema>;
  joinedAt: string;
  leftAt: string | null;
}

export interface DeveloperUserDetail extends DeveloperUserRow {
  deletedAt: string | null;
  consentVersion: string;
  consentAt: string;
  pinChangedAt: string | null;
  paymentNumbers: DeveloperPaymentNumber[];
  devices: DeveloperDevice[];
  logins: DeveloperLogin[];
  memberships: DeveloperMembership[];
}

export interface DeveloperGroupCycle {
  number: number;
  roundCount: number;
  /** The round in progress, or null before round 1 opens. */
  currentRound: { number: number; status: 'SCHEDULED' | 'OPEN' | 'PAYOUT' | 'CLOSED' } | null;
}

export interface DeveloperGroupRow {
  id: string;
  name: string;
  status: z.infer<typeof groupStatusSchema>;
  hidden: boolean;
  memberCount: number;
  createdAt: string;
  cycle: DeveloperGroupCycle | null;
}

/** What is still running in a group; every figure except `pendingActions` blocks a closing. */
export interface DeveloperInFlight {
  openPayments: number;
  openDisbursements: number;
  /** Loans and solidarity payouts that were approved and are not yet sent. */
  approvedPayouts: number;
  openVotes: number;
  pendingActions: number;
}

export interface DeveloperGroupMember {
  membershipId: string;
  userId: string;
  name: string;
  phone: string | null;
  role: z.infer<typeof membershipRoleSchema>;
  status: z.infer<typeof membershipStatusSchema>;
}

/** What members still hold in the group; any figure above zero stops a closing (D28). */
export interface DeveloperHeldMoney {
  obligations: number;
  loans: number;
  balances: number;
  /** Bidding pots still holding money (D10). */
  pots: number;
}

export interface DeveloperGroupDetail extends DeveloperGroupRow {
  hiddenAt: string | null;
  heldMoney: DeveloperHeldMoney;
  firstPayoutAt: string;
  createdByName: string;
  inFlight: DeveloperInFlight;
  members: DeveloperGroupMember[];
}
