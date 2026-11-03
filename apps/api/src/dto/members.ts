// Member mappers per audience (spec 2.11, R1.3). Neither mapper can output a phone number: the
// source type doesn't even carry one.
import type { AdminMemberDto, PublicMemberDto } from '@njangi/shared/contracts/groups';
import type { MembershipRef, MembershipRole, MembershipStatus } from '../permissions/actor';
import { iso, isoOrNull } from './time';

export interface MemberSource {
  id: string;
  role: MembershipRole;
  status: MembershipStatus;
  createdAt: Date;
  activeFromCycle: number | null;
  leftAt: Date | null;
  user: { name: string };
}

/** `toPublicMember`: what every member sees about another member. */
export function toPublicMember(member: MemberSource, viewerMembershipId: string): PublicMemberDto {
  return {
    membershipId: member.id,
    name: member.user.name,
    role: member.role,
    status: member.status,
    isMe: member.id === viewerMembershipId,
    joinedAt: iso(member.createdAt),
  };
}

/** `toAdminView`: the admin also sees activation and departure. Still no phone number (R1.3). */
export function toAdminView(member: MemberSource, viewerMembershipId: string): AdminMemberDto {
  return {
    ...toPublicMember(member, viewerMembershipId),
    activeFromCycle: member.activeFromCycle,
    leftAt: isoOrNull(member.leftAt),
  };
}

/** Picks the audience from the viewer's own membership. */
export function toMemberFor(viewer: MembershipRef, member: MemberSource): PublicMemberDto | AdminMemberDto {
  return viewer.role === 'ADMIN' ? toAdminView(member, viewer.id) : toPublicMember(member, viewer.id);
}
