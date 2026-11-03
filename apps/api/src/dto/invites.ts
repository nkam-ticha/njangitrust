// Invite mappers. The invited phone exists only as a keyed hash and is never mapped.
import type { InvitePreviewDto } from '@njangi/shared/contracts/invites';
import type { z } from 'zod';
import type { inviteListItemSchema } from '@njangi/shared/contracts/invites';
import { iso } from './time';
import { toRuleSet, type RuleSetSource } from './groups';

export interface InviteSource {
  id: string;
  inviteeName: string;
  proposalId: string | null;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export function inviteStatus(invite: InviteSource, now: Date): 'PENDING' | 'USED' | 'EXPIRED' | 'REVOKED' {
  if (invite.usedAt) return 'USED';
  if (invite.revokedAt) return 'REVOKED';
  if (invite.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  return 'PENDING';
}

export function toInviteListItem(invite: InviteSource, now: Date): z.infer<typeof inviteListItemSchema> {
  return {
    id: invite.id,
    inviteeName: invite.inviteeName,
    status: inviteStatus(invite, now),
    founding: invite.proposalId === null,
    expiresAt: iso(invite.expiresAt),
    createdAt: iso(invite.createdAt),
  };
}

export function toInvitePreview(input: {
  invite: InviteSource;
  groupName: string;
  invitedByName: string;
  memberCount: number;
  ruleSet: RuleSetSource;
}): InvitePreviewDto {
  return {
    groupName: input.groupName,
    invitedByName: input.invitedByName,
    inviteeName: input.invite.inviteeName,
    memberCount: input.memberCount,
    founding: input.invite.proposalId === null,
    expiresAt: iso(input.invite.expiresAt),
    rules: toRuleSet(input.ruleSet),
  };
}
