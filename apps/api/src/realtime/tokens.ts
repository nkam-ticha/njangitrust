// A Supabase Realtime token is deliberately separate from the application's access token.
// It is short lived and is only accepted by Supabase's private Broadcast authorization policies.
import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { getEnv } from '../config/env';
import { clock } from '../lib/clock';

export const REALTIME_TOKEN_TTL_SECONDS = 5 * 60;

export async function signRealtimeToken(input: {
  userId: string;
  sessionId: string;
}): Promise<{ token: string; expiresAt: Date }> {
  const issuedAt = Math.floor(clock.nowMs() / 1000);
  const expiresAtSeconds = issuedAt + REALTIME_TOKEN_TTL_SECONDS;
  const secret = new TextEncoder().encode(getEnv().SUPABASE_JWT_SECRET);
  const token = await new SignJWT({ role: 'authenticated', sid: input.sessionId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(input.userId)
    .setAudience('authenticated')
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAtSeconds)
    .setJti(randomUUID())
    .sign(secret);
  return { token, expiresAt: new Date(expiresAtSeconds * 1000) };
}
