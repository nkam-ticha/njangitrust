// Refresh tokens (spec 2.10, D7): opaque, 30 days, stored as an HMAC, rotated on every use. All
// rotations of one login form a family; presenting an already-used token means it was copied, so
// the whole family is revoked and the member is warned.
import { clock } from '../../lib/clock';
import { hashRefreshToken, newId, randomToken } from '../../lib/crypto';
import { getPrisma, type Db } from '../../lib/prisma';
import type { ClientKind } from '../../permissions/actor';

export const REFRESH_TOKEN_TTL_DAYS = 30;
const DAY_MS = 86_400_000;

type RevokeReason = 'LOGOUT' | 'LOGOUT_ALL' | 'REUSE_DETECTED' | 'PIN_CHANGED' | 'PIN_RESET' | 'ACCOUNT_DELETED';

export const toDbClient = (client: ClientKind) => (client === 'web' ? 'WEB' : 'MOBILE') as const;
export const fromDbClient = (client: 'WEB' | 'MOBILE'): ClientKind => (client === 'WEB' ? 'web' : 'mobile');

export interface IssuedRefreshToken {
  id: string;
  familyId: string;
  token: string;
  expiresAt: Date;
}

export async function issueRefreshToken(
  db: Db,
  input: { userId: string; familyId?: string; client: ClientKind; deviceId?: string | null },
): Promise<IssuedRefreshToken> {
  const token = randomToken(32);
  const expiresAt = new Date(clock.nowMs() + REFRESH_TOKEN_TTL_DAYS * DAY_MS);
  const row = await db.refreshToken.create({
    data: {
      userId: input.userId,
      familyId: input.familyId ?? newId(),
      tokenHash: hashRefreshToken(token),
      client: toDbClient(input.client),
      deviceId: input.deviceId ?? null,
      expiresAt,
    },
    select: { id: true, familyId: true },
  });
  return { id: row.id, familyId: row.familyId, token, expiresAt };
}

export type RotationResult =
  | { ok: true; userId: string; client: ClientKind; issued: IssuedRefreshToken }
  | { ok: false; reason: 'INVALID' | 'EXPIRED' }
  | { ok: false; reason: 'REUSED'; userId: string; familyId: string };

export async function revokeFamily(db: Db, familyId: string, reason: RevokeReason): Promise<void> {
  await db.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: clock.now(), revokedReason: reason },
  });
}

export async function revokeAllForUser(db: Db, userId: string, reason: RevokeReason): Promise<void> {
  await db.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: clock.now(), revokedReason: reason },
  });
}

/**
 * Exchanges a refresh token for a new one in the same family. The old token is claimed with an
 * atomic update, so two concurrent uses can never both succeed: the loser counts as reuse.
 */
export async function rotateRefreshToken(token: string): Promise<RotationResult> {
  const prisma = getPrisma();
  const now = clock.now();
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(token) },
    include: { user: { select: { deletedAt: true } } },
  });
  if (!row || row.user.deletedAt) return { ok: false, reason: 'INVALID' };
  if (row.usedAt && !row.revokedAt) {
    return { ok: false, reason: 'REUSED', userId: row.userId, familyId: row.familyId };
  }
  if (row.revokedAt) return { ok: false, reason: 'INVALID' };
  if (row.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'EXPIRED' };

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.refreshToken.updateMany({
      where: { id: row.id, usedAt: null, revokedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) {
      return { ok: false, reason: 'REUSED', userId: row.userId, familyId: row.familyId } as const;
    }
    const client = fromDbClient(row.client);
    const issued = await issueRefreshToken(tx, {
      userId: row.userId,
      familyId: row.familyId,
      client,
      deviceId: row.deviceId,
    });
    await tx.refreshToken.update({ where: { id: row.id }, data: { replacedByTokenId: issued.id } });
    return { ok: true, userId: row.userId, client, issued } as const;
  });
}

/** The family of a token, if it exists (logout from a refresh token). */
export async function familyOfToken(token: string): Promise<{ familyId: string; userId: string } | null> {
  const row = await getPrisma().refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(token) },
    select: { familyId: true, userId: true },
  });
  return row;
}
