// Statement mappers (spec 2.11, 2.14): an allowlist of fields. The storage key, the ledger head hash
// and the member never leave; the public verification answer carries no name and no number.
import type { StatementDto, VerifyResult } from '@njangi/shared/contracts/statements';
import { iso } from './time';

export interface StatementSource {
  id: string;
  createdAt: Date;
  periodStart: Date;
  periodEnd: Date;
  language: 'fr' | 'en';
  verificationCode: string;
  membership: { groupId: string; group: { name: string } };
}

/** The member's own statement. `verifyHost` is the public host without the scheme (D9). */
export function toStatement(s: StatementSource, verifyHost: string): StatementDto {
  return {
    id: s.id,
    groupId: s.membership.groupId,
    groupName: s.membership.group.name,
    period: { start: iso(s.periodStart), end: iso(s.periodEnd) },
    language: s.language,
    issuedAt: iso(s.createdAt),
    verificationCode: s.verificationCode,
    verifyAddress: `${verifyHost}/verify/${s.verificationCode}`,
  };
}

/** What anyone holding a code may learn (2.14): genuine or not, the period and the issue date. */
export function toVerifyResult(
  s: Pick<StatementSource, 'createdAt' | 'periodStart' | 'periodEnd'> | null,
): VerifyResult {
  if (!s) return { genuine: false };
  return {
    genuine: true,
    period: { start: iso(s.periodStart), end: iso(s.periodEnd) },
    issuedAt: iso(s.createdAt),
  };
}
