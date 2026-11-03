// Group mappers (allowlists). Group rows hold no personal data, but the shape is still explicit.
import type { GroupDto, RuleSetDto } from '@njangi/shared/contracts/groups';
import { ruleSetParamsSchema } from '@njangi/shared/contracts/groups';
import type { MyGroupDto } from '@njangi/shared/contracts/me';
import type { GroupStatus, MembershipRef } from '../permissions/actor';
import { iso } from './time';

export interface GroupSource {
  id: string;
  name: string;
  status: GroupStatus;
  firstPayoutAt: Date;
  createdAt: Date;
}

export function toGroup(group: GroupSource, memberCount: number): GroupDto {
  return {
    id: group.id,
    name: group.name,
    status: group.status,
    firstPayoutAt: iso(group.firstPayoutAt),
    memberCount,
    createdAt: iso(group.createdAt),
  };
}

export function toMyMembership(membership: MembershipRef) {
  return { membershipId: membership.id, role: membership.role, status: membership.status };
}

export function toMyGroup(
  group: Pick<GroupSource, 'id' | 'name' | 'status'>,
  membership: MembershipRef,
  memberCount: number,
): MyGroupDto {
  return {
    groupId: group.id,
    name: group.name,
    status: group.status,
    membershipId: membership.id,
    role: membership.role,
    membershipStatus: membership.status,
    memberCount,
  };
}

export interface RuleSetSource {
  version: number;
  params: unknown;
  effectiveFromRoundId: string | null;
  createdAt: Date;
}

/** The stored params are re-parsed with the strict contract, so only known rule keys go out. */
export function toRuleSet(ruleSet: RuleSetSource): RuleSetDto {
  return {
    version: ruleSet.version,
    params: ruleSetParamsSchema.parse(ruleSet.params),
    effectiveFromRoundId: ruleSet.effectiveFromRoundId,
    createdAt: iso(ruleSet.createdAt),
  };
}
