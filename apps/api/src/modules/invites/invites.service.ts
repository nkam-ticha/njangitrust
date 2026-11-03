// Invitations (spec 2.10, R1.5, R1.6, R12.1): the admin's request becomes an INVITE_CREATE card;
// the link shows the group and its rules; accepting is single use, before expiry, and only with
// the invited phone. A wrong phone does not consume the invite.
import { MAX_MEMBERS, newMemberActiveFromCycle } from '@njangi/rules';
import type { AcceptInviteRequest, CreateInviteRequest } from '@njangi/shared/contracts/invites';
import { groupTexts } from '@njangi/shared/i18n/server/groups';
import { AfterCommit } from '../../lib/after-commit';
import { clock } from '../../lib/clock';
import { hashLinkToken, hashPhone, safeEqual } from '../../lib/crypto';
import { commonError } from '../../lib/errors';
import { getPrisma, withTransaction, type Invite, type PendingAction, type RuleSet } from '../../lib/prisma';
import { bilingual, ui } from '../../lib/texts';
import { authorizeGroup, type AuthActor, type ClientKind, type MembershipRef } from '../../permissions';
import { lazyLimiter } from '../../http/rate-limit';
import type { GroupSource } from '../../dto';
import { audit } from '../audit';
import { insertAccount, prepareAccount, startSession, type SessionTokens } from '../auth';
import { postSystemMessage } from '../chat';
import { COUNTED_STATUSES, countMembers } from '../groups';
import { createNotifications } from '../notifications';
import { createPendingAction } from '../pending-actions';
import { getCurrentRuleSet } from '../rulesets';
import { inviteError } from './invites.errors';
import type { InviteArgs } from './invites.actions';

/** Wrong phone numbers typed on one invite link: five, then the link is locked for 15 minutes. */
const phoneAttempts = lazyLimiter({ name: 'invite-phone', points: 5, durationSeconds: 900, blockSeconds: 900 });

export async function requestInvite(actor: AuthActor, groupId: string, input: CreateInviteRequest): Promise<PendingAction> {
  const args: InviteArgs = {
    groupId,
    inviteeName: input.name,
    phoneHash: hashPhone(input.phone),
    proposalId: input.proposalId ?? null,
  };
  return createPendingAction({ userId: actor.userId, groupId, lang: actor.lang, origin: 'UI', type: 'INVITE_CREATE', args });
}

export async function listInvites(userId: string, groupId: string): Promise<Invite[]> {
  await authorizeGroup(userId, groupId, 'group.invites.read');
  return getPrisma().invite.findMany({ where: { groupId }, orderBy: { createdAt: 'desc' }, take: 200 });
}

async function findUsableInvite(token: string) {
  const invite = await getPrisma().invite.findUnique({
    where: { tokenHash: hashLinkToken(token) },
    include: {
      group: { select: { id: true, name: true, status: true, firstPayoutAt: true, createdAt: true, currentCycle: { select: { number: true } } } },
      createdBy: { select: { user: { select: { name: true } } } },
    },
  });
  if (!invite || invite.revokedAt) throw inviteError('INVITE_NOT_FOUND');
  if (invite.usedAt) throw inviteError('INVITE_USED');
  if (invite.expiresAt <= clock.now()) throw inviteError('INVITE_EXPIRED');
  if (invite.group.status === 'CLOSED') throw inviteError('GROUP_CLOSED');
  return invite;
}

export interface InvitePreview {
  invite: Invite;
  groupName: string;
  invitedByName: string;
  memberCount: number;
  ruleSet: RuleSet;
}

/** R1.5: what the person sees before accepting. Public, but only for a valid link. */
export async function previewInvite(token: string): Promise<InvitePreview> {
  const invite = await findUsableInvite(token);
  const [memberCount, ruleSet] = await Promise.all([countMembers(invite.groupId), getCurrentRuleSet(invite.groupId)]);
  return { invite, groupName: invite.group.name, invitedByName: invite.createdBy.user.name, memberCount, ruleSet };
}

export interface AcceptedInvite {
  group: GroupSource;
  membership: MembershipRef;
  memberCount: number;
  userId: string;
  session: SessionTokens | null;
}

export async function acceptInvite(
  token: string,
  input: AcceptInviteRequest,
  actor: AuthActor | undefined,
  client: ClientKind,
): Promise<AcceptedInvite> {
  const invite = await findUsableInvite(token);
  let phone: string;
  if (input.mode === 'signup') phone = input.phone;
  else {
    if (!actor) throw commonError('UNAUTHENTICATED');
    phone = (await getPrisma().user.findUniqueOrThrow({ where: { id: actor.userId }, select: { loginPhone: true } })).loginPhone;
  }
  const attemptsKey = `i:${invite.id}`;
  const attempts = await phoneAttempts.get().get(attemptsKey);
  if (attempts && attempts.consumedPoints >= 5) throw inviteError('INVITE_PHONE_MISMATCH');
  if (!safeEqual(hashPhone(phone), invite.phoneHash)) {
    await phoneAttempts.get().consume(attemptsKey).catch(() => undefined);
    throw inviteError('INVITE_PHONE_MISMATCH');
  }
  const account = input.mode === 'signup' ? await prepareAccount(input) : null;

  const effects = new AfterCommit();
  const result = await withTransaction(async (tx) => {
    const now = clock.now();
    const claimed = await tx.invite.updateMany({
      where: { id: invite.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw inviteError('INVITE_USED');

    const user = account ? await insertAccount(tx, account) : await tx.user.findUniqueOrThrow({ where: { id: actor!.userId }, select: { id: true, sessionEpoch: true } });
    const existing = await tx.membership.findUnique({ where: { groupId_userId: { groupId: invite.groupId, userId: user.id } } });
    if (existing && (COUNTED_STATUSES as readonly string[]).includes(existing.status)) throw inviteError('ALREADY_MEMBER');
    if ((await countMembers(invite.groupId, tx)) >= MAX_MEMBERS) throw inviteError('GROUP_FULL', { params: { max: MAX_MEMBERS } });

    const founding = invite.group.status === 'FORMING';
    const data = {
      role: 'MEMBER' as const,
      status: founding ? ('ACTIVE' as const) : ('INVITED' as const),
      activeFromCycle: newMemberActiveFromCycle(founding ? null : (invite.group.currentCycle?.number ?? 0)),
      leftAt: null,
    };
    const membership = existing
      ? await tx.membership.update({ where: { id: existing.id }, data, select: { id: true, role: true, status: true } })
      : await tx.membership.create({ data: { ...data, groupId: invite.groupId, userId: user.id }, select: { id: true, role: true, status: true } });
    await tx.invite.update({ where: { id: invite.id }, data: { acceptedByUserId: user.id } });

    const joined = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true } });
    await postSystemMessage(invite.groupId, ui((c) => c.chat.system.memberJoined, { name: joined.name }), effects, tx);
    const admins = await tx.membership.findMany({ where: { groupId: invite.groupId, role: 'ADMIN', status: { in: ['ACTIVE', 'LEAVING'] } }, select: { userId: true } });
    await createNotifications(
      admins.map((a) => ({
        userId: a.userId,
        groupId: invite.groupId,
        category: 'GROUP' as const,
        title: groupTexts.memberJoinedTitle,
        body: bilingual(groupTexts.memberJoinedBody, { name: joined.name, group: invite.group.name }),
        deepLink: `/groups/${invite.groupId}/members`,
      })),
      effects,
      tx,
    );
    await audit({ action: 'invite.accepted', actorUserId: user.id, groupId: invite.groupId, target: `Invite:${invite.id}`, details: { founding } }, tx);
    const session = account ? await startSession(tx, user, client) : null;
    return { userId: user.id, membership, session, memberCount: await countMembers(invite.groupId, tx) };
  });
  await effects.run();
  const { currentCycle: _cycle, ...group } = invite.group;
  return { group, ...result };
}
