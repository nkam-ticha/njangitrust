// A failed login is recorded the same way whether or not the phone has an account, so the time the
// answer takes does not reveal which phones are registered; no phone number is ever written.
import { describe, expect, it } from 'vitest';
import { getPrisma } from '../../../lib/prisma';
import { api } from '../../../../test/helpers/client';
import { freshPhone, signUp } from '../../../../test/helpers/factories';

const failedSince = (since: Date) =>
  getPrisma().auditLog.findMany({
    where: { action: 'auth.login.failed', createdAt: { gte: since } },
  });

describe('failed logins in the audit log', () => {
  it('writes one entry for a known phone and one for an unknown phone, without any number', async () => {
    const since = new Date(Date.now() - 1_000);
    const known = await signUp();
    const unknownPhone = await freshPhone();
    const wrongPin = '135790';
    for (const phone of [known.phone, unknownPhone]) {
      const res = await api(null, { ownPhones: [phone] }).post('/v1/auth/login', {
        phone,
        pin: wrongPin,
      });
      expect(res.status).toBe(401);
    }
    const rows = await failedSince(since);
    const mine = rows.filter((row) => row.actorUserId === known.id || row.actorUserId === null);
    expect(mine.length).toBeGreaterThanOrEqual(2);
    expect(mine.some((row) => row.actorUserId === known.id)).toBe(true);
    expect(mine.some((row) => row.actorUserId === null)).toBe(true);
    expect(JSON.stringify(rows)).not.toContain(known.phone.slice(-8));
    expect(JSON.stringify(rows)).not.toContain(unknownPhone.slice(-8));
  });
});
