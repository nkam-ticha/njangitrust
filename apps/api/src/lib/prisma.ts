// The database client (D2: the API connects as njangi_app, which cannot change ledger rows).
// Prisma 7 talks to PostgreSQL through the official driver adapter (D4: @prisma/adapter-pg).
// Other files import Prisma types from here, never from the generated folder directly.
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../../generated/prisma/client';
import { getEnv } from '../config/env';

export { Prisma, PrismaClient };
export type {
  Group,
  Invite,
  Membership,
  PaymentNumber,
  PendingAction,
  PinReset,
  Proposal,
  RefreshToken,
  RuleSet,
  User,
} from '../../generated/prisma/client';

/** A client or an interactive transaction: what repository functions accept. */
export type Db = PrismaClient | Prisma.TransactionClient;

export function createPrisma(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

let client: PrismaClient | undefined;

/** The process-wide client, created on first use from DATABASE_URL. */
export function getPrisma(): PrismaClient {
  client ??= createPrisma(getEnv().DATABASE_URL);
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}

/** Runs `fn` in one database transaction (READ COMMITTED). */
export function withTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { timeoutMs?: number } = {},
): Promise<T> {
  return getPrisma().$transaction(fn, { timeout: options.timeoutMs ?? 15_000, maxWait: 5_000 });
}

/** True when a Prisma error is a unique-constraint violation (P2002). */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
