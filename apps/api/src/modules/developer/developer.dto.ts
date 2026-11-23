// The developer's own allowlist mappers (D28). This is the only audience that receives full phone
// numbers, so every field is picked by name from what the service loaded; nothing is spread, and no
// member, agent or notification mapper reuses these. A deleted account's phone is erased already:
// it reads as null here, never as the placeholder.
import type {
  DeveloperDevice,
  DeveloperGroupDetail,
  DeveloperGroupMember,
  DeveloperGroupRow,
  DeveloperInFlight,
  DeveloperLogin,
  DeveloperMembership,
  DeveloperPaymentNumber,
  DeveloperUserDetail,
  DeveloperUserRow,
} from '@njangi/shared/contracts/developer';

type Instant = Date;
const iso = (d: Instant): string => d.toISOString();
const isoOrNull = (d: Instant | null): string | null => (d ? d.toISOString() : null);
/** Erased accounts keep `deleted:<id>` in the login column; that is not a phone number. */
const phoneOf = (value: string, deletedAt: Instant | null): string | null =>
  deletedAt || value.startsWith('deleted:') ? null : value;

export interface UserRowSource {
  id: string;
  name: string;
  loginPhone: string;
  language: 'fr' | 'en';
  createdAt: Instant;
  deletedAt: Instant | null;
  lastLoginAt: Instant | null;
  groupCount: number;
}

export function toDeveloperUserRow(s: UserRowSource): DeveloperUserRow {
  return {
    id: s.id,
    name: s.name,
    phone: phoneOf(s.loginPhone, s.deletedAt),
    language: s.language,
    status: s.deletedAt ? 'DELETED' : 'ACTIVE',
    createdAt: iso(s.createdAt),
    lastLoginAt: isoOrNull(s.lastLoginAt),
    groupCount: s.groupCount,
  };
}

export interface UserDetailSource extends UserRowSource {
  consentVersion: string;
  consentAt: Instant;
  pinChangedAt: Instant | null;
  paymentNumbers: {
    number: string;
    operator: 'MTN' | 'ORANGE' | 'UNKNOWN';
    activeFrom: Instant;
    activeTo: Instant | null;
  }[];
  devices: {
    id: string;
    platform: 'ANDROID' | 'IOS' | 'WEB';
    createdAt: Instant;
    lastSeenAt: Instant;
    revokedAt: Instant | null;
    expoPushToken: string | null;
  }[];
  logins: {
    sessionId: string;
    client: 'MOBILE' | 'WEB';
    loggedInAt: Instant;
    lastActiveAt: Instant;
    open: boolean;
  }[];
  memberships: {
    groupId: string;
    groupName: string;
    groupStatus: 'FORMING' | 'ACTIVE' | 'CLOSED';
    groupHiddenAt: Instant | null;
    role: 'ADMIN' | 'MEMBER';
    status: 'INVITED' | 'ACTIVE' | 'LEAVING' | 'LEFT' | 'REMOVED';
    joinedAt: Instant;
    leftAt: Instant | null;
  }[];
}

export function toDeveloperUserDetail(s: UserDetailSource): DeveloperUserDetail {
  const paymentNumbers: DeveloperPaymentNumber[] = s.deletedAt
    ? []
    : s.paymentNumbers.map((n) => ({
        number: n.number,
        operator: n.operator,
        activeFrom: iso(n.activeFrom),
        activeTo: isoOrNull(n.activeTo),
      }));
  const devices: DeveloperDevice[] = s.devices.map((d) => ({
    id: d.id,
    platform: d.platform,
    createdAt: iso(d.createdAt),
    lastSeenAt: iso(d.lastSeenAt),
    revoked: d.revokedAt !== null,
    // The push token itself is never sent, only whether one is registered.
    hasPushToken: d.expoPushToken !== null,
  }));
  const logins: DeveloperLogin[] = s.logins.map((l) => ({
    sessionId: l.sessionId,
    client: l.client,
    loggedInAt: iso(l.loggedInAt),
    lastActiveAt: iso(l.lastActiveAt),
    open: l.open,
  }));
  const memberships: DeveloperMembership[] = s.memberships.map((m) => ({
    groupId: m.groupId,
    groupName: m.groupName,
    groupStatus: m.groupStatus,
    groupHidden: m.groupHiddenAt !== null,
    role: m.role,
    status: m.status,
    joinedAt: iso(m.joinedAt),
    leftAt: isoOrNull(m.leftAt),
  }));
  return {
    ...toDeveloperUserRow(s),
    deletedAt: isoOrNull(s.deletedAt),
    consentVersion: s.consentVersion,
    consentAt: iso(s.consentAt),
    pinChangedAt: isoOrNull(s.pinChangedAt),
    paymentNumbers,
    devices,
    logins,
    memberships,
  };
}

export interface GroupRowSource {
  id: string;
  name: string;
  status: 'FORMING' | 'ACTIVE' | 'CLOSED';
  hiddenByDeveloperAt: Instant | null;
  createdAt: Instant;
  memberCount: number;
  cycle: {
    number: number;
    roundCount: number;
    currentRound: { number: number; status: 'SCHEDULED' | 'OPEN' | 'PAYOUT' | 'CLOSED' } | null;
  } | null;
}

export function toDeveloperGroupRow(s: GroupRowSource): DeveloperGroupRow {
  return {
    id: s.id,
    name: s.name,
    status: s.status,
    hidden: s.hiddenByDeveloperAt !== null,
    memberCount: s.memberCount,
    createdAt: iso(s.createdAt),
    cycle: s.cycle
      ? {
          number: s.cycle.number,
          roundCount: s.cycle.roundCount,
          currentRound: s.cycle.currentRound
            ? { number: s.cycle.currentRound.number, status: s.cycle.currentRound.status }
            : null,
        }
      : null,
  };
}

export interface GroupDetailSource extends GroupRowSource {
  firstPayoutAt: Instant;
  heldMoney: { obligations: number; loans: number; balances: number; pots: number };
  createdByName: string;
  inFlight: DeveloperInFlight;
  members: {
    membershipId: string;
    userId: string;
    name: string;
    loginPhone: string;
    deletedAt: Instant | null;
    role: 'ADMIN' | 'MEMBER';
    status: 'INVITED' | 'ACTIVE' | 'LEAVING' | 'LEFT' | 'REMOVED';
  }[];
}

export function toDeveloperGroupDetail(s: GroupDetailSource): DeveloperGroupDetail {
  const members: DeveloperGroupMember[] = s.members.map((m) => ({
    membershipId: m.membershipId,
    userId: m.userId,
    name: m.name,
    phone: phoneOf(m.loginPhone, m.deletedAt),
    role: m.role,
    status: m.status,
  }));
  return {
    ...toDeveloperGroupRow(s),
    hiddenAt: isoOrNull(s.hiddenByDeveloperAt),
    heldMoney: {
      obligations: s.heldMoney.obligations,
      loans: s.heldMoney.loans,
      balances: s.heldMoney.balances,
      pots: s.heldMoney.pots,
    },
    firstPayoutAt: iso(s.firstPayoutAt),
    createdByName: s.createdByName,
    inFlight: {
      openPayments: s.inFlight.openPayments,
      openDisbursements: s.inFlight.openDisbursements,
      approvedPayouts: s.inFlight.approvedPayouts,
      openVotes: s.inFlight.openVotes,
      pendingActions: s.inFlight.pendingActions,
    },
    members,
  };
}
