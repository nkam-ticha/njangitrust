// Who is acting. The acting member always comes from the verified session (or, for the agent,
// from its server-side ctx), never from request arguments (spec 4.2).
import type { Lang } from '@njangi/shared';

export type ClientKind = 'mobile' | 'web';

/** An authenticated user, as established by the access token and checked against the database. */
export interface AuthActor {
  userId: string;
  lang: Lang;
  /** The refresh-token family this access token belongs to (one per login). */
  sessionId: string;
  client: ClientKind;
}

export type MembershipRole = 'ADMIN' | 'MEMBER';
export type MembershipStatus = 'INVITED' | 'ACTIVE' | 'LEAVING' | 'LEFT' | 'REMOVED';
export type GroupStatus = 'FORMING' | 'ACTIVE' | 'CLOSED';

/** The actor's own membership in the group a decision is about. */
export interface MembershipRef {
  id: string;
  role: MembershipRole;
  status: MembershipStatus;
}

/** A user seen from inside one group. `membership` is null when they are not a member. */
export interface GroupActor {
  userId: string;
  membership: MembershipRef | null;
}
