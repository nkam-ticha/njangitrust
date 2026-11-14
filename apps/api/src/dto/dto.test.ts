// DTO allowlists (spec 2.11): every response parses with the strict contract schema (no extra
// field can slip through), and no audience ever receives someone else's number.
import { describe, expect, it } from 'vitest';
import { authResponseSchema } from '@njangi/shared/contracts/auth';
import {
  adminMemberSchema,
  groupOverviewSchema,
  membersResponseSchema,
  publicMemberSchema,
  rulesResponseSchema,
} from '@njangi/shared/contracts/groups';
import { invitePreviewSchema } from '@njangi/shared/contracts/invites';
import { myGroupsResponseSchema, selfSchema } from '@njangi/shared/contracts/me';
import { pendingActionResponseSchema } from '@njangi/shared/contracts/pending-actions';
import { api } from '../../test/helpers/client';
import { inviteToken, ownPhonesOf, signupBody } from '../../test/helpers/factories';
import { useWorld } from '../../test/helpers/permission-matrix';
import { toActionResultData } from './action-results';
import { toAdminView, toPublicMember } from './members';

/** Strict parse: fails on any field the contract does not list. */
function valid(
  schema: { safeParse(v: unknown): { success: boolean; error?: unknown } },
  value: unknown,
): void {
  const result = schema.safeParse(value);
  expect(result.success, JSON.stringify(result.error)).toBe(true);
}

describe('allowlist mappers', () => {
  const source = {
    id: '6b1f0a2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
    role: 'MEMBER' as const,
    status: 'ACTIVE' as const,
    createdAt: new Date('2026-11-01T10:00:00Z'),
    activeFromCycle: 1,
    leftAt: null,
    // Extra fields a careless query might load are never copied.
    user: { name: 'Paul Mbarga', loginPhone: '+237677123456', pinHash: 'x' },
  };

  it('toPublicMember outputs exactly the public fields', () => {
    const dto = toPublicMember(source, 'someone-else');
    expect(Object.keys(dto).sort()).toEqual([
      'isMe',
      'joinedAt',
      'membershipId',
      'name',
      'role',
      'status',
    ]);
    valid(publicMemberSchema, dto);
  });

  it('toAdminView adds activation and departure, still no number (R1.3)', () => {
    const dto = toAdminView(source, 'someone-else');
    valid(adminMemberSchema, dto);
    expect(JSON.stringify(dto)).not.toContain('677123456');
  });
});

describe('responses match their strict contracts', () => {
  const world = useWorld();

  it('auth, me and groups', async () => {
    const w = world();
    const body = signupBody();
    const signup = await api(null, { ownPhones: ownPhonesOf(body) }).post('/v1/auth/signup', body);
    valid(authResponseSchema, signup.body);
    valid(selfSchema, (await api(w.member).get('/v1/me')).body.user);
    valid(myGroupsResponseSchema, (await api(w.member).get('/v1/me/groups')).body);
    valid(groupOverviewSchema, (await api(w.member).get(`/v1/groups/${w.groupId}/overview`)).body);
    valid(rulesResponseSchema, (await api(w.member).get(`/v1/groups/${w.groupId}/rules`)).body);
  });

  it('members: public for a member, admin view for the admin', async () => {
    const w = world();
    const asMember = membersResponseSchema.parse(
      (await api(w.member).get(`/v1/groups/${w.groupId}/members`)).body,
    );
    for (const m of asMember.members) valid(publicMemberSchema, m);
    const asAdmin = (await api(w.admin).get(`/v1/groups/${w.groupId}/members`)).body
      .members as unknown[];
    for (const m of asAdmin) valid(adminMemberSchema, m);
  });

  it('invite previews and pending actions', async () => {
    const w = world();
    const token = await inviteToken(w.admin, w.groupId, signupBody());
    valid(invitePreviewSchema, (await api().get(`/v1/auth/invites/${token}`)).body.invite);
    const card = await api(w.admin).post(`/v1/groups/${w.groupId}/invites`, {
      name: 'Nadège Nkeng',
      phone: signupBody().phone,
    });
    valid(pendingActionResponseSchema, card.body);
  });
});

describe('confirmation result data (privacy-guard M4)', () => {
  it('keeps only the allowlisted fields of known action types', () => {
    const data = {
      inviteId: 'i',
      link: 'https://x/invite/t',
      expiresAt: '2026-11-06T10:00:00.000Z',
      phoneHash: 'secret',
      extra: 1,
    };
    expect(toActionResultData('INVITE_CREATE', data)).toEqual({
      type: 'INVITE_CREATE',
      inviteId: 'i',
      link: 'https://x/invite/t',
      expiresAt: '2026-11-06T10:00:00.000Z',
    });
  });

  it('returns nothing for an action type without a result shape', () => {
    expect(toActionResultData('VOTE_CAST', { choice: 'YES' })).toBeNull();
    expect(toActionResultData('INVITE_CREATE', null)).toBeNull();
  });
});
